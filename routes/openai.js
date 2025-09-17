// File: routes/openai.js
import express from "express";
import { OpenAI } from "openai";
import { authenticateToken } from "./auth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import htmlDocx from "html-docx-js";
import db from "../db/index.js";

import mammoth from "mammoth";
import PizZip from "pizzip";              // npm i pizzip
import { XMLParser, XMLBuilder } from "fast-xml-parser"; // npm i fast-xml-parser

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "../assets/KashTech_Sample_SOW_with_Placeholders.docx");

// ✅ 1. Generate preview HTML by replacing placeholders
router.post("/generate-preview-doc", authenticateToken, async (req, res) => {
    try {
        const {
            companyName,
            industry,
            services,
            startDate,
            endDate,
            clientContact = "Client Representative",
            clientEmail = "client@example.com",
            clientPhone = "123-456-7890",
            kasTechContact = "Kamesh Gopalan",
            kasTechEmail = "kamesh@kashtechllc.com",
            kasTechPhone = "847-445-3064",
            techStack = "Java, React, PostgreSQL",
            engagementModel = "T&M",
            billingTerms = "monthly hours logged",
            estimatedDuration = "6 months"
        } = req.body;

        const today = new Date();
        const formattedDate = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        const shortDate = today.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

        const replacements = {
            CLIENTNAME: companyName,
            CLIENTORGANIZATION: companyName,
            CLIENTCONTACTNAME: clientContact,
            CLIENTCONTACTEMAIL: clientEmail,
            CLIENTCONTACTPHONE: clientPhone,
            KASHTECHNAME: "KashTech",
            CONSULTANTNAME: "Kevin Munley",
            KASHCONTACTNAME: kasTechContact,
            KASHCONTACTEMAIL: kasTechEmail,
            KASHCONTACTPHONE: kasTechPhone,
            SERVICES: services,
            TECHSTACK: techStack,
            ENGAGEMENTMODEL: engagementModel,
            BILLINGTERMS: billingTerms,
            ESTIMATEDDURATION: estimatedDuration,
            RATEPLACEHOLDER: "$120/hr",
            TODAYDATE: formattedDate,
            TODAYFOOTER: shortDate
        };

        // expand this with different specific keys later instead of an number added to the end

        const docxBuffer = fs.readFileSync(TEMPLATE_PATH);
        const { templateVersion, createdAt, allBlocks, nonEmptyBlocks } = await readDocxToMap(docxBuffer);
        console.log("Template version:", templateVersion);
        console.log("Created at:", createdAt);
        console.log("Document block map all:", JSON.stringify(allBlocks, null, 2));
        // console.log("Document block map non-empty:", JSON.stringify(nonEmptyBlocks, null, 2));

        const { blocks: updatedAllBlocks, stats } = mapReplacementsOnBlocks(replacements, allBlocks);
        console.log("Replacement stats:", JSON.stringify(stats, null, 2));
        console.log("Replacement updated blocks:", JSON.stringify(updatedAllBlocks, null, 2));

        const finalDocxBuffer = await regenerateDocxFromBlocks(updatedAllBlocks);
        const { value: rawHtml } = await mammoth.convertToHtml({ buffer: finalDocxBuffer }); // Converting to HTML, we should probably show preview in HTML format but when doownloading we convert back to DOCX

        res.json({ previewHtml: rawHtml });
        
    } catch (err) {
        console.error("❌ Error rendering preview", err);
        res.status(500).json({ error: "Failed to render preview" });
    }
});

const parser = new XMLParser({
    ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,           // <-- key
});


const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "text",
  suppressEmptyNode: false,
  format: false, // keep compact
});

// Tags we never want to treat as text
const SKIP_TAGS = new Set([
    "w:proofErr", "w:bookmarkStart", "w:bookmarkEnd",
    "w:permStart", "w:permEnd", "w:lastRenderedPageBreak",
    "w:noProof", "w:fldChar", "w:sectPr", "w:drawing",
    "mc:AlternateContent"
]);

async function readDocxToMap(docxBuffer) {
    const zip = new PizZip(docxBuffer);

    const partNames = ["word/document.xml"];
    for (const name of Object.keys(zip.files)) {
        if (/^word\/header\d+\.xml$/.test(name) || /^word\/footer\d+\.xml$/.test(name)) {
            partNames.push(name);
        }
    }

    function extractText(node, tagName = "") {
        if (typeof node === "string") return node;
        if (!node) return "";
        if (Array.isArray(node)) return node.map(n => extractText(n)).join("");

        // Map special inline nodes to visible chars
        if (tagName === "w:br" || tagName === "w:cr") return "\n";
        if (tagName === "w:tab") return "\t";
        if (tagName === "w:noBreakHyphen") return "-";
        if (tagName === "w:softHyphen") return "\u00AD";

        // Skip non-text markers
        if (SKIP_TAGS.has(tagName)) return "";

        // <w:t>
        if (Object.prototype.hasOwnProperty.call(node, "w:t")) {
            const t = node["w:t"];
            if (typeof t === "string") return t;               // already untrimmed due to trimValues:false
            const raw = t?.text ?? "";
            // If xml:space="preserve", keep exactly; otherwise still keep as-is since trimValues:false
            return raw;
        }

        // Recurse, ignoring attributes
        let out = "";
        for (const key of Object.keys(node)) {
            if (key.startsWith("@_")) continue;
            out += extractText(node[key], key);
        }
        return out;
    }


    function collectBlocksFromPart(partName, xmlText) {
        const blocks = [];
        if (!xmlText) return blocks;

        const json = parser.parse(xmlText);
        const root = json?.["w:document"]?.["w:body"] || json?.["w:hdr"] || json?.["w:ftr"];
        if (!root) return blocks;

        const paras = root["w:p"] ? (Array.isArray(root["w:p"]) ? root["w:p"] : [root["w:p"]]) : [];
        const tables = root["w:tbl"] ? (Array.isArray(root["w:tbl"]) ? root["w:tbl"] : [root["w:tbl"]]) : [];

        const scope =
            partName === "word/document.xml"
                ? "DOC"
                : partName.includes("header")
                    ? partName.match(/header(\d+)/)?.[1] ? `HDR${partName.match(/header(\d+)/)[1]}` : "HDR"
                    : partName.includes("footer")
                        ? partName.match(/footer(\d+)/)?.[1] ? `FTR${partName.match(/footer(\d+)/)[1]}` : "FTR"
                        : "PART";

        // Paragraphs
        paras.forEach((p, idx) => {
            const pPr = p?.["w:pPr"] || {};
            const pStyle = pPr?.["w:pStyle"]?.["@_w:val"] || pPr?.["w:pStyle"]?.["w:val"] || null;
            const numPr = pPr?.["w:numPr"] || null;
            const ilvl = numPr?.["w:ilvl"]?.["@_w:val"] ?? numPr?.["w:ilvl"]?.["w:val"] ?? null;
            const numId = numPr?.["w:numId"]?.["@_w:val"] ?? numPr?.["w:numId"]?.["w:val"] ?? null;

            const text = extractText(p).replace(/\s+\n/g, "\n").trim();  // normalize a bit
            const pid = `${scope}-P${String(idx + 1).padStart(6, "0")}`;

            blocks.push({
                pid,
                kind: "paragraph",
                part: partName,
                index: idx,
                style: pStyle,
                list: numId ? { numId: String(numId), ilvl: ilvl != null ? String(ilvl) : null } : null,
                text
            });
        });

        // Tables → cells
        tables.forEach((tbl, tIndex) => {
            const rows = tbl?.["w:tr"] ? (Array.isArray(tbl["w:tr"]) ? tbl["w:tr"] : [tbl["w:tr"]]) : [];
            rows.forEach((tr, rIdx) => {
                const cells = tr?.["w:tc"] ? (Array.isArray(tr["w:tc"]) ? tr["w:tc"] : [tr["w:tc"]]) : [];
                cells.forEach((tc, cIdx) => {
                    const cellParas = tc?.["w:p"] ? (Array.isArray(tc["w:p"]) ? tc["w:p"] : [tc["w:p"]]) : [];
                    const cellText = cellParas.map(p => extractText(p)).join("\n").trim();
                    const pid = `${scope}-T${String(tIndex + 1).padStart(3, "0")}-R${String(rIdx + 1).padStart(3, "0")}-C${String(cIdx + 1).padStart(3, "0")}`;

                    blocks.push({
                        pid,
                        kind: "tableCell",
                        part: partName,
                        tableIndex: tIndex,
                        row: rIdx,
                        col: cIdx,
                        text: cellText
                    });
                });
            });
        });

        return blocks;
    }

    const docMap = { templateVersion: "v1", createdAt: new Date().toISOString(), blocks: [] };

    for (const name of partNames) {
        const file = zip.file(name);
        if (!file) continue;
        const xml = file.asText();
        docMap.blocks.push(...collectBlocksFromPart(name, xml));

    }

    // After you finish building `docMap.blocks` in docxToJson:
    function addOrdinals(blocks) {
        // group by (part, kind) so ordinals are local to each XML part & block type
        const groups = new Map();
        for (const b of blocks) {
            const key = `${b.part}|${b.kind}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(b);
        }

        for (const [, arr] of groups) {
            // Stable order: paragraphs by `index`, table cells by (tableIndex,row,col)
            arr.sort((a, b) => {
                if (a.kind === "paragraph" && b.kind === "paragraph") {
                    return a.index - b.index;
                }
                if (a.kind === "tableCell" && b.kind === "tableCell") {
                    return (a.tableIndex - b.tableIndex) || (a.row - b.row) || (a.col - b.col);
                }
                return 0;
            });

            // ordinal among all items in this group
            arr.forEach((b, i) => { b.ordinalAll = i; });

            // tag empties and compute ordinal among non-empty
            let k = 0;
            for (const b of arr) {
                b.isEmpty = (b.text ?? "").trim().length === 0;
                b.ordinalNonEmpty = b.isEmpty ? null : k++;
            }
        }
    }

    // Build both views
    addOrdinals(docMap.blocks);

    // Canonical (everything)
    const blocksAll = docMap.blocks;

    // Derived non-empty view (for LLM/UI)
    // Keep same fields, just filter where ordinalNonEmpty != null
    const blocksNonEmpty = blocksAll.filter(b => b.ordinalNonEmpty !== null);

    // Example API response shape:
    return {
        templateVersion: docMap.templateVersion,
        createdAt: docMap.createdAt,
        allBlocks: blocksAll, // master list used for write-back
        nonEmptyBlocks: blocksNonEmpty,  // convenience view for LLM/UI prompts
    };

}

// Core mapper: works directly on an array of blocks
function mapReplacementsOnBlocks(replacements, blocks) {
    if (!Array.isArray(blocks)) throw new Error("blocks must be an array");

    const escapeRegExp = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keys = Object.keys(replacements || {}).sort((a, b) => b.length - a.length);
    const compiled = keys.map((k) => ({
        key: k,
        re: new RegExp(`%%${escapeRegExp(k)}%%`, "g"),
        val: String(replacements[k] ?? ""),
    }));

    const hitCounts = Object.fromEntries(keys.map((k) => [k, 0]));
    const changedPids = [];

    const updatedBlocks = blocks.map((b) => {
        if (!b || typeof b.text !== "string" || b.text.length === 0) return b;

        let text = b.text;
        let changed = false;

        for (const { key, re, val } of compiled) {
            const matches = text.match(re);
            if (matches && matches.length > 0) {
                hitCounts[key] += matches.length;
                changed = true;
                text = text.replace(re, () => val); // avoid $-expansion
            }
        }

        if (changed) changedPids.push(b.pid);
        return changed ? { ...b, text } : b;
    });

    // Leftover placeholders per PID (useful to spot missed tokens)
    const remainingPlaceholders = {};
    const phRegex = /%%([A-Z0-9_]+)%%/g;
    for (const b of updatedBlocks) {
        if (typeof b?.text !== "string") continue;
        const m = b.text.match(phRegex);
        if (m && m.length) remainingPlaceholders[b.pid] = m;
    }

    return {
        blocks: updatedBlocks,
        stats: { changedPids, hitCounts, remainingPlaceholders },
    };
}

/**
 * Replace a paragraph node's text with a single run/t, preserving pPr (paragraph props).
 */
function setParagraphText(pNode, newText) {
    if (!pNode) return;

    // Preserve paragraph properties if present
    const pPr = pNode["w:pPr"] ? pNode["w:pPr"] : undefined;

    // Build a single run with a single text node; xml:space="preserve" keeps spaces/newlines
    const newRun = {
        "w:r": {
            "w:t": {
                "@_xml:space": "preserve",
                text: newText ?? "",
            },
        },
    };

    // Reassign children: keep pPr first, then the new run
    const out = {};
    if (pPr) out["w:pPr"] = pPr;
    Object.assign(out, newRun);

    // Mutate in place
    for (const k of Object.keys(pNode)) delete pNode[k];
    for (const k of Object.keys(out)) pNode[k] = out[k];
}

/**
 * Replace a table cell's content with a single paragraph containing newText.
 * Preserves tcPr (cell props).
 */
function setCellText(tcNode, newText) {
    if (!tcNode) return;

    const tcPr = tcNode["w:tcPr"] ? tcNode["w:tcPr"] : undefined;
    const newPara = {
        "w:p": {
            "w:r": {
                "w:t": {
                    "@_xml:space": "preserve",
                    text: newText ?? "",
                },
            },
        },
    };
    const out = {};
    if (tcPr) out["w:tcPr"] = tcPr;
    Object.assign(out, newPara);

    // Mutate in place
    for (const k of Object.keys(tcNode)) delete tcNode[k];
    for (const k of Object.keys(out)) tcNode[k] = out[k];
}

/**
 * Utility to normalize node -> array
 */
function asArray(x) {
    if (!x) return [];
    return Array.isArray(x) ? x : [x];
}

/**
 * Group blocks by part & kind for efficient updates.
 */
function groupBlocks(blocks) {
    const byPart = new Map();
    for (const b of blocks) {
        if (!b || typeof b.text !== "string") continue; // skip invalid
        if (!byPart.has(b.part)) byPart.set(b.part, { paragraph: [], tableCell: [] });
        byPart.get(b.part)[b.kind]?.push(b);
    }
    return byPart;
}

/**
 * Regenerate a DOCX buffer from the template using updated blocks.
 * - `blocks` must contain original indices (paragraph.index / table coords).
 * - Only text content is replaced; structure/styles at paragraph/table level remain.
 */
export async function regenerateDocxFromBlocks(blocks) {
    // 1) Load template
    const templateBuf = fs.readFileSync(TEMPLATE_PATH);
    const zip = new PizZip(templateBuf);

    // Determine all word parts present (same as in your reader)
    const partNames = ["word/document.xml"];
    for (const name of Object.keys(zip.files)) {
        if (/^word\/header\d+\.xml$/.test(name) || /^word\/footer\d+\.xml$/.test(name)) {
            partNames.push(name);
        }
    }

    // 2) Group incoming updates
    const grouped = groupBlocks(blocks);

    // 3) Apply updates per part
    for (const partName of partNames) {
        const file = zip.file(partName);
        if (!file) continue;

        const xml = file.asText();
        const json = parser.parse(xml);

        // Word roots vary by part
        const root =
            json?.["w:document"]?.["w:body"] ||
            json?.["w:hdr"] ||
            json?.["w:ftr"];

        if (!root) continue;

        const updates = grouped.get(partName);
        if (!updates) continue;

        // Paragraph updates
        if (updates.paragraph.length) {
            // Normalize to arrays
            if (root["w:p"] && !Array.isArray(root["w:p"])) {
                root["w:p"] = [root["w:p"]];
            }
            const paras = root["w:p"] || [];

            for (const blk of updates.paragraph) {
                const idx = Number(blk.index);
                if (Number.isInteger(idx) && idx >= 0 && idx < paras.length) {
                    setParagraphText(paras[idx], blk.text);
                }
            }
        }

        // Table cell updates
        if (updates.tableCell.length) {
            // Normalize tables to arrays
            if (root["w:tbl"] && !Array.isArray(root["w:tbl"])) {
                root["w:tbl"] = [root["w:tbl"]];
            }
            const tbls = root["w:tbl"] || [];

            for (const blk of updates.tableCell) {
                const t = Number(blk.tableIndex);
                const r = Number(blk.row);
                const c = Number(blk.col);
                if (!Number.isInteger(t) || !Number.isInteger(r) || !Number.isInteger(c)) continue;

                const tbl = tbls[t];
                if (!tbl) continue;

                // Normalize rows
                if (tbl["w:tr"] && !Array.isArray(tbl["w:tr"])) {
                    tbl["w:tr"] = [tbl["w:tr"]];
                }
                const rows = tbl["w:tr"] || [];
                const tr = rows[r];
                if (!tr) continue;

                // Normalize cells
                if (tr["w:tc"] && !Array.isArray(tr["w:tc"])) {
                    tr["w:tc"] = [tr["w:tc"]];
                }
                const cells = tr["w:tc"] || [];
                const tc = cells[c];
                if (!tc) continue;

                setCellText(tc, blk.text);
            }
        }

        // 4) Build XML back and write into the zip
        const newXml = builder.build(json);
        zip.file(partName, newXml);
    }

    // 5) Return new DOCX buffer
    const out = zip.generate({ type: "nodebuffer" });
    return out;
}


// ✅ 3. Save edited HTML to DB
router.post("/save-edited-doc", authenticateToken, async (req, res) => {
    const { clientId, editedHtml, metaFields, doc_type } = req.body;

    if (!clientId || !editedHtml || !doc_type) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        await db.query(
            `
        INSERT INTO sow_documents (client_id, edited_html, meta_fields, doc_type, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (client_id, doc_type)
        DO UPDATE SET edited_html = $2, meta_fields = $3, updated_at = NOW()
        `,
            [clientId, editedHtml, metaFields, doc_type]
        );

        res.json({ success: true }); // ✅ Ensure this is sent back
    } catch (err) {
        console.error("❌ Error saving document:", err);
        res.status(500).json({ error: "Failed to save document" });
    }
});

// ✅ 4. Download final DOCX based on saved edited HTML
router.get("/download-edited-doc", authenticateToken, async (req, res) => {
    const { clientId } = req.query;
    try {
        const result = await db.query(
            `SELECT edited_html FROM sow_documents WHERE client_id = $1`,
            [clientId]
        );

        if (result.rowCount === 0 || !result.rows[0].edited_html) {
            return res.status(404).json({ error: "No saved document found" });
        }

        const editedHtml = result.rows[0].edited_html;

        const fullHtml = `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Calibri, sans-serif; font-size: 11pt; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #ccc; padding: 6px; }
          </style>
        </head>
        <body>${editedHtml}</body>
      </html>
    `;

        const blob = htmlDocx.asBlob(fullHtml);
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader("Content-Disposition", `attachment; filename=SOW_${clientId}.docx`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.send(buffer);

    } catch (err) {
        console.error("❌ Error in /download-edited-doc", err);
        res.status(500).json({ error: "Failed to generate DOCX" });
    }
});

// ✅ 2. Apply GPT-based edits to the HTML
router.post("/edit-doc", authenticateToken, async (req, res) => {
    const { originalContent, instruction } = req.body;

    try {
        const prompt = `Edit the following HTML based on instruction: "${instruction}". Return only clean HTML.`;
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "user", content: prompt },
                { role: "assistant", content: originalContent },
            ],
        });

        const edited = response.choices?.[0]?.message?.content;
        res.json({ content: edited });
    } catch (err) {
        console.error("❌ Edit failed", err);
        res.status(500).json({ error: "Failed to edit document" });
    }
});



////////////////////////////////////////////////////MSA

// ✅ Generate preview HTML for MSA
router.post("/generate-preview-msa", authenticateToken, async (req, res) => {
    try {
        const {
            companyName,
            industry,
            services,
            startDate,
            endDate,
            clientContact = "Client Representative",
            clientEmail = "client@example.com",
            clientPhone = "123-456-7890",
            kasTechContact = "Kamesh Gopalan",
            kasTechEmail = "kamesh@kashtechllc.com",
            kasTechPhone = "847-445-3064",
            techStack = "Java, React, PostgreSQL",
            engagementModel = "T&M",
            billingTerms = "monthly hours logged",
            estimatedDuration = "6 months"
        } = req.body;

        const today = new Date();
        const formattedDate = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        const shortDate = today.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

        const replacements = {
            CLIENTNAME1: companyName,
            CLIENTORGANIZATION: companyName,
            CLIENTCONTACTNAME: clientContact,
            CLIENTCONTACTEMAIL: clientEmail,
            CLIENTCONTACTPHONE: clientPhone,
            KASHTECHNAME1: "KashTech",
            KASHCONTACTNAME1: kasTechContact,
            KASHCONTACTEMAIL: kasTechEmail,
            KASHCONTACTPHONE: kasTechPhone,
            SERVICES: services,
            TECHSTACK1: techStack,
            ENGAGEMENTMODEL: engagementModel,
            BILLINGTERMS: billingTerms,
            ESTIMATEDDURATION: estimatedDuration,
            TODAYDATE: formattedDate,
            TODAYFOOTER: shortDate,
            STARTDATE: startDate,
            ENDDATE: endDate
        };

        const MSA_TEMPLATE_PATH = path.join(__dirname, "../assets/KashTech_Sample_MSA_with_Placeholders.docx");
        const docxBuffer = fs.readFileSync(MSA_TEMPLATE_PATH);
        const { value: rawHtml } = await mammoth.convertToHtml({ buffer: docxBuffer });

        let renderedHtml = rawHtml;
        for (const [key, val] of Object.entries(replacements)) {
            const regex = new RegExp(`%%${key}%%`, "g");
            renderedHtml = renderedHtml.replace(regex, val);
        }

        res.json({ previewHtml: renderedHtml });
    } catch (err) {
        console.error("❌ Error rendering MSA preview", err);
        res.status(500).json({ error: "Failed to render MSA preview" });
    }
});

// ✅ Save edited MSA HTML
router.post("/save-edited-msa-doc", authenticateToken, async (req, res) => {
    const { clientId, editedHtml, metaFields } = req.body;
    try {
        await db.query(`
        INSERT INTO sow_documents (client_id, edited_html, meta_fields, updated_at, doc_type)
        VALUES ($1, $2, $3, NOW(), 'MSA')
        ON CONFLICT (client_id, doc_type) DO UPDATE SET
          edited_html = EXCLUDED.edited_html,
          meta_fields = EXCLUDED.meta_fields,
          updated_at = NOW()
      `, [clientId, editedHtml, JSON.stringify(metaFields)]);
        res.json({ message: "MSA saved successfully" });
    } catch (err) {
        console.error("❌ Failed to save MSA doc", err);
        res.status(500).json({ error: "Save failed" });
    }
});

// ✅ Download final MSA DOCX
router.get("/download-edited-msa-doc", authenticateToken, async (req, res) => {
    const { clientId } = req.query;
    try {
        const result = await db.query(
            `SELECT edited_html FROM sow_documents WHERE client_id = $1 AND doc_type = 'MSA'`,
            [clientId]
        );

        if (result.rowCount === 0 || !result.rows[0].edited_html) {
            return res.status(404).json({ error: "No saved MSA document found" });
        }

        const editedHtml = result.rows[0].edited_html;

        const fullHtml = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Calibri, sans-serif; font-size: 11pt; }
              table { border-collapse: collapse; width: 100%; }
              td, th { border: 1px solid #ccc; padding: 6px; }
            </style>
          </head>
          <body>${editedHtml}</body>
        </html>
      `;

        const blob = htmlDocx.asBlob(fullHtml);
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader("Content-Disposition", `attachment; filename=MSA_${clientId}.docx`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.send(buffer);
    } catch (err) {
        console.error("❌ Error in /download-edited-msa-doc", err);
        res.status(500).json({ error: "Failed to generate MSA DOCX" });
    }
});


export default router;
