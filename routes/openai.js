// File: routes/openai.js
import express from "express";
import { OpenAI } from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

import { authenticateToken } from "./auth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import htmlDocx from "html-docx-js";
import db from "../db/index.js";

import mammoth from "mammoth";

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
        // Read template
        const docxBuffer = fs.readFileSync(TEMPLATE_PATH);

        // Convert DOCX -> HTML
        const { value: rawHtml /*, messages */ } = await mammoth.convertToHtml(
            { buffer: docxBuffer },
            {
                convertImage: mammoth.images.inline((image) => {
                    // Inline images as data URLs for preview
                    return image.read("base64").then((b64) => ({
                        src: `data:${image.contentType};base64,${b64}`,
                    }));
                }),
                // styleMap: [], // optional
            }
        );

        // --- helpers ---
        function escapeRegExp(s) {
            return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        function escapeHtml(str = "") {
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }
        function normalizeValueForHtml(value) {
            return escapeHtml(value ?? "").replace(/\r?\n/g, "<br>");
        }
        // ---------------

        // Replace %%PLACEHOLDER%% tokens in the HTML
        let previewHtml = rawHtml;
        for (const [key, rawVal] of Object.entries(replacements)) {
            const token = `%%${key}%%`;
            const val = normalizeValueForHtml(rawVal);
            const re = new RegExp(escapeRegExp(token), "g");
            previewHtml = previewHtml.replace(re, val);
        }

        // Return the preview HTML (not a DOCX buffer)
        return res.status(200).json({ previewHtml });

    } catch (err) {
        console.error("❌ Error rendering preview", err);
        res.status(500).json({ error: "Failed to render preview" });
    }
});

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

const EditSchema = z.object({
  edited_text: z.string().describe("The edited version of the selected text. No quotes or extra commentary."),
});

// ✅ 2. Apply GPT-based edits to the HTML
router.post("/edit-doc", authenticateToken, async (req, res) => {
  const { originalContent, rewriteInstruction } = req.body;

  if (typeof originalContent !== "string" || !originalContent.trim()) {
    return res.status(400).json({ error: "originalContent is required" });
  }
  if (typeof rewriteInstruction !== "string" || !rewriteInstruction.trim()) {
    return res.status(400).json({ error: "rewriteInstruction is required" });
  }

  const systemInstruction = `You a highly skilled legal document editor. 
  You are always provided with an excerpt from an original legal document along with a question, instruction, or request about how to edit that excerpt.
  You must follow the instruction precisely and ONLY return the edited text.
  You must not add any commentary, notes, or additional text.
  Return the edited text in with the appopriate editing applied.`;

  console.log("📝 Edit request:", { originalContent, rewriteInstruction });

  try {
    const resp = await openai.responses.parse({
      model: "gpt-5-nano", // model with structured output support
      input: [
        {
          role: "system",
          content: systemInstruction,
        },
        {
          role: "user",
          content:
            `INSTRUCTION:\n${rewriteInstruction}\n\nSELECTED_TEXT:\n${originalContent}`,
        },
      ],
      text: {
        // Enforce JSON shape { edited_text: string }
        format: zodTextFormat(EditSchema, "edit"),
      },
    });

    // Parsed, typed object
    const parsed = resp.output_parsed; // { edited_text: "..." }
    const editedText = (parsed?.edited_text ?? "").trim();

    console.log("✅ Edit response:", { editedText });

    // Return exactly what your front end expects
    return res.json({ content: editedText });

  } catch (err) {
     console.error("❌ Fallback edit failed:", e2);
      return res.status(500).json({ error: "Failed to edit document" });
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

        const docxBuffer = fs.readFileSync(TEMPLATE_PATH);
        const { value: rawHtml } = await mammoth.convertToHtml({ buffer: docxBuffer });

        let renderedHtml = rawHtml;
        for (const [key, val] of Object.entries(replacements)) {
            const regex = new RegExp(`%%${key}%%`, "g");
            renderedHtml = renderedHtml.replace(regex, val);
        }

        return res.status(200).json({ previewHtml });

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
