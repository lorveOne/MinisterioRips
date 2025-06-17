const fs = require('fs');
const xml2js = require('xml2js');
const { DOMParser } = require('xmldom');

/**
 * Extraer período de facturación con xml2js
 * @param {string} xmlFilePath - Ruta del archivo XML
 * @returns {Object} Período de facturación
 */
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



/**
 * Exportar funciones
 * @returns {Object} Funciones
 */
module.exports = {
    extractInvoicePeriodWithXml2js,
    formatInvoicePeriod
};

// Ejecutar si se llama directamente
if (require.main === module) {
    main().catch(console.error);
}