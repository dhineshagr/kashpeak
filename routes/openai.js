// File: routes/openai.js
import express from "express";
import { OpenAI } from "openai";
import { authenticateToken } from "./auth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mammoth from "mammoth";
import htmlDocx from "html-docx-js";
import db from "../db/index.js";

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
            CLIENTNAME1: companyName,
            CLIENTNAME2: companyName,
            CLIENTNAME3: companyName,
            CLIENTNAME4: companyName,
            CLIENTNAME5: companyName,
            CLIENTNAME6: companyName,
            CLIENTORGANIZATION: companyName,
            CLIENTCONTACTNAME: clientContact,
            CLIENTCONTACTEMAIL: clientEmail,
            CLIENTCONTACTPHONE: clientPhone,
            KASHTECHNAME1: "KashTech",
            KASHTECHNAME2: "KashTech",
            KASHTECHNAME3: "KashTech",
            KASHTECHNAME4: "KashTech",
            KASHTECHNAME5: "KashTech",
            KASHTECHNAME6: "KashTech",
            KASHTECHNAME7: "KashTech",
            KASHTECHNAME8: "KashTech",
            KASHTECHNAME9: "KashTech",
            CONSULTANTNAME: "Kevin Munley",
            KASHCONTACTNAME1: kasTechContact,
            KASHCONTACTNAME2: kasTechContact,
            KASHCONTACTEMAIL: kasTechEmail,
            KASHCONTACTPHONE: kasTechPhone,
            SERVICES: services,
            TECHSTACK1: techStack,
            TECHSTACK2: techStack,
            TECHSTACK3: techStack,
            TECHSTACK4: techStack,
            TECHSTACK5: techStack,
            ENGAGEMENTMODEL: engagementModel,
            BILLINGTERMS: billingTerms,
            ESTIMATEDDURATION: estimatedDuration,
            RATEPLACEHOLDER1: "$120/hr",
            RATEPLACEHOLDER2: "$100/hr",
            RATEPLACEHOLDER3: "$130/hr",
            RATEPLACEHOLDER4: "$90/hr",
            TODAYDATE: formattedDate,
            TODAYFOOTER: shortDate

        };

        const docxBuffer = fs.readFileSync(TEMPLATE_PATH);
        const { value: rawHtml } = await mammoth.convertToHtml({ buffer: docxBuffer });

        let renderedHtml = rawHtml;
        for (const [key, val] of Object.entries(replacements)) {
            const regex = new RegExp(`%%${key}%%`, "g");
            renderedHtml = renderedHtml.replace(regex, val);
        }

        res.json({ previewHtml: renderedHtml });
    } catch (err) {
        console.error("❌ Error rendering preview", err);
        res.status(500).json({ error: "Failed to render preview" });
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
