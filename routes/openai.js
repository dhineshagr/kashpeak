// File: routes/openai.js
import express from "express";
import { OpenAI } from "openai";
import { authenticateToken } from "./auth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import mammoth from "mammoth";
import mustache from "mustache";
import htmlDocx from "html-docx-js";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "../assets/KashTech_Sample_SOW_with_Placeholders.docx");


// ✅ Load and replace placeholders in the template before showing preview
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
        const formattedDate = today.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
        });
        const shortDate = today.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric"
        });

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

        // Replace %%PLACEHOLDER%% in HTML
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


router.post("/generate-doc-from-template", authenticateToken, async (req, res) => {
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
            estimatedDuration = "6 months",
        } = req.body;

        const today = new Date();
        const formattedDate = today.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        const shortDate = today.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
        });

        const content = fs.readFileSync(TEMPLATE_PATH, "binary");
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: "%%", end: "%%" }, // important: your template uses %%VAR%%
        });

        doc.setData({
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
            TODAYFOOTER: shortDate,
        });

        doc.render();

        const buffer = doc.getZip().generate({ type: "nodebuffer" });
        res.setHeader("Content-Disposition", `attachment; filename=SOW_${companyName.replace(/\s+/g, "_")}.docx`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.send(buffer);
    } catch (err) {
        console.error("❌ Failed to generate DOCX from template", err);
        res.status(500).json({ error: "Failed to generate DOCX from template" });
    }
});


// ✅ 2. Edit the HTML preview content using GPT
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

// ✅ 3. Generate .docx from Word template
router.post("/generate-doc-from-template", authenticateToken, async (req, res) => {
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
            estimatedDuration = "6 months",
        } = req.body;

        const today = new Date();
        const formattedDate = today.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        const shortDate = today.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
        });

        const content = fs.readFileSync(TEMPLATE_PATH, "binary");
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: "%%", end: "%%" },
        });

        doc.setData({
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
            TODAYFOOTER: shortDate,
        });

        doc.render();

        const buffer = doc.getZip().generate({ type: "nodebuffer" });
        res.setHeader("Content-Disposition", `attachment; filename=SOW_${companyName.replace(/\s+/g, "_")}.docx`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.send(buffer);
    } catch (err) {
        console.error("❌ Failed to generate DOCX from template", err);
        res.status(500).json({ error: "Failed to generate DOCX from template" });
    }
});


// Inside your /download-edited-doc route
router.post("/download-edited-doc", authenticateToken, async (req, res) => {
    const {
      companyName = "Client",
      industry = "Software",
      services = "Software Development",
      startDate,
      endDate,
      editedHtml,
    } = req.body;
  
    try {
      const content = fs.readFileSync(TEMPLATE_PATH, "binary");
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "%%", end: "%%" },
      });
  
      const today = new Date();
      const formattedDate = today.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const shortDate = today.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
  
      // Final values used in template
      doc.setData({
        CLIENTNAME1: companyName,
        CLIENTNAME2: companyName,
        CLIENTNAME3: companyName,
        CLIENTNAME4: companyName,
        CLIENTNAME5: companyName,
        CLIENTNAME6: companyName,
        CLIENTORGANIZATION: companyName,
        CLIENTCONTACTNAME: "Fred Bond",
        CLIENTCONTACTEMAIL: "client@example.com",
        CLIENTCONTACTPHONE: "555-555-1234",
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
        KASHCONTACTNAME1: "Kamesh Gopalan",
        KASHCONTACTNAME2: "Kamesh Gopalan",
        KASHCONTACTEMAIL: "kamesh@kashtechllc.com",
        KASHCONTACTPHONE: "847-445-3064",
        SERVICES: services,
        TECHSTACK1: "React, Node.js, PostgreSQL",
        TECHSTACK2: "React, Node.js, PostgreSQL",
        TECHSTACK3: "React, Node.js, PostgreSQL",
        TECHSTACK4: "React, Node.js, PostgreSQL",
        TECHSTACK5: "React, Node.js, PostgreSQL",
        ENGAGEMENTMODEL: "T&M",
        BILLINGTERMS: "Monthly hours logged",
        ESTIMATEDDURATION: "6 months",
        RATEPLACEHOLDER1: "$120/hr",
        RATEPLACEHOLDER2: "$100/hr",
        RATEPLACEHOLDER3: "$130/hr",
        RATEPLACEHOLDER4: "$90/hr",
        TODAYDATE: formattedDate,
        TODAYFOOTER: shortDate
      });
  
      doc.render();
      const buffer = doc.getZip().generate({ type: "nodebuffer" });
  
      res.setHeader("Content-Disposition", `attachment; filename=Edited_SOW_${companyName.replace(/\s+/g, "_")}.docx`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.send(buffer);
    } catch (err) {
      console.error("❌ Final DOCX generation failed", err);
      res.status(500).json({ error: "Failed to generate final document" });
    }
  });
  
  

export default router;
