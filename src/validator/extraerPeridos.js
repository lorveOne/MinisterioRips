// Opción 1: CommonJS (Node.js tradicional)
const fs = require('fs');
const xml2js = require('xml2js');
const { DOMParser } = require('xmldom');

// Opción 2: ES Modules (si usas type: "module" en package.json)
// import fs from 'fs';
// import xml2js from 'xml2js';
// import { DOMParser } from 'xmldom';

// Opción 3: Usando fs/promises para async/await
// const fs = require('fs').promises;

// Método 1: Usando xml2js (más fácil)
async function extractInvoicePeriodWithXml2js(xmlFilePath) {
    try {
        const xmlData = fs.readFileSync(xmlFilePath, 'utf8');
        const parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: false,
            tagNameProcessors: [xml2js.processors.stripPrefix]
        });
        
        const result = await parser.parseStringPromise(xmlData);
        
        // Navegar hasta el período de facturación
        const invoice = result.AttachedDocument.Attachment.ExternalReference.Description;
        
        // El XML está dentro de CDATA, necesitamos parsearlo nuevamente
        const invoiceXml = invoice.replace('<![CDATA[', '').replace(']]>', '');
        const invoiceResult = await parser.parseStringPromise(invoiceXml);
        
        const invoicePeriod = invoiceResult.Invoice.InvoicePeriod;
        
        return {
            startDate: invoicePeriod.StartDate,
            startTime: invoicePeriod.StartTime,
            endDate: invoicePeriod.EndDate,
            endTime: invoicePeriod.EndTime
        };
        
    } catch (error) {
        console.error('Error extracting invoice period:', error);
        return null;
    }
}

// Método 2: Usando DOMParser (más control)
function extractInvoicePeriodWithDOM(xmlFilePath) {
    try {
        const xmlData = fs.readFileSync(xmlFilePath, 'utf8');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlData, 'text/xml');
        
        // Obtener el CDATA que contiene la factura
        const cdataElement = xmlDoc.getElementsByTagName('cbc:Description')[0];
        const cdataContent = cdataElement.textContent;
        
        // Parsear el XML interno
        const invoiceDoc = parser.parseFromString(cdataContent, 'text/xml');
        
        // Extraer elementos del período de facturación
        const startDate = invoiceDoc.getElementsByTagName('cbc:StartDate')[0]?.textContent;
        const startTime = invoiceDoc.getElementsByTagName('cbc:StartTime')[0]?.textContent;
        const endDate = invoiceDoc.getElementsByTagName('cbc:EndDate')[0]?.textContent;
        const endTime = invoiceDoc.getElementsByTagName('cbc:EndTime')[0]?.textContent;
        
        return {
            startDate,
            startTime,
            endDate,
            endTime
        };
        
    } catch (error) {
        console.error('Error extracting invoice period:', error);
        return null;
    }
}

// Método 3: Usando expresiones regulares (más rápido pero menos robusto)
function extractInvoicePeriodWithRegex(xmlFilePath) {
    try {
        const xmlData = fs.readFileSync(xmlFilePath, 'utf8');
        
        // Extraer fechas usando regex
        const startDateMatch = xmlData.match(/<cbc:StartDate>(\d{4}-\d{2}-\d{2})<\/cbc:StartDate>/);
        const startTimeMatch = xmlData.match(/<cbc:StartTime>([^<]+)<\/cbc:StartTime>/);
        const endDateMatch = xmlData.match(/<cbc:EndDate>(\d{4}-\d{2}-\d{2})<\/cbc:EndDate>/);
        const endTimeMatch = xmlData.match(/<cbc:EndTime>([^<]+)<\/cbc:EndTime>/);
        
        return {
            startDate: startDateMatch ? startDateMatch[1] : null,
            startTime: startTimeMatch ? startTimeMatch[1] : null,
            endDate: endDateMatch ? endDateMatch[1] : null,
            endTime: endTimeMatch ? endTimeMatch[1] : null
        };
        
    } catch (error) {
        console.error('Error extracting invoice period:', error);
        return null;
    }
}

// Función utilitaria para formatear el resultado
function formatInvoicePeriod(period) {
    if (!period) return null;
    
    const startDateTime = new Date(`${period.startDate}T${period.startTime || '00:00:00'}`);
    const endDateTime = new Date(`${period.endDate}T${period.endTime || '23:59:59'}`);
    
    return {
        startDate: period.startDate,
        endDate: period.endDate,
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        duration: Math.ceil((endDateTime - startDateTime) / (1000 * 60 * 60 * 24)), // días
        formattedPeriod: `Del ${period.startDate} al ${period.endDate}`
    };
}

// Ejemplo de uso
async function main() {
    const xmlFilePath = 'factura.xml'; // Ruta a tu archivo XML
    
    console.log('=== Método 1: xml2js ===');
    const period1 = await extractInvoicePeriodWithXml2js(xmlFilePath);
    console.log(formatInvoicePeriod(period1));
    
    console.log('\n=== Método 2: DOMParser ===');
    const period2 = extractInvoicePeriodWithDOM(xmlFilePath);
    console.log(formatInvoicePeriod(period2));
    
    console.log('\n=== Método 3: Regex ===');
    const period3 = extractInvoicePeriodWithRegex(xmlFilePath);
    console.log(formatInvoicePeriod(period3));
}

// Función específica para extraer desde string XML
function extractFromXmlString(xmlString) {
    const startDateMatch = xmlString.match(/<cbc:StartDate>(\d{4}-\d{2}-\d{2})<\/cbc:StartDate>/);
    const endDateMatch = xmlString.match(/<cbc:EndDate>(\d{4}-\d{2}-\d{2})<\/cbc:EndDate>/);
    
    return {
        startDate: startDateMatch ? startDateMatch[1] : null,
        endDate: endDateMatch ? endDateMatch[1] : null
    };
}

// Exportar funciones
module.exports = {
    extractInvoicePeriodWithXml2js,
    extractInvoicePeriodWithDOM,
    extractInvoicePeriodWithRegex,
    formatInvoicePeriod,
    extractFromXmlString
};

// Ejecutar si se llama directamente
if (require.main === module) {
    main().catch(console.error);
}