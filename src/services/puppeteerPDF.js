import puppeteer from 'puppeteer-core';
import fs from 'fs';

class SimplePuppeteerPDF {
  static async generatePDF(htmlContent) {
    let browser = null;
    
    try {
      console.log('🚀 Iniciando generación de PDF...');

      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
      ];

      let executablePath = null;
      for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
          executablePath = chromePath;
          console.log('Chrome encontrado:', executablePath);
          break;
        }
      }

      if (!executablePath) {
        throw new Error('No se encontró Chrome instalado');
      }

      // Configuración mínima - sin userDataDir, sin args complejos
      browser = await puppeteer.launch({
        executablePath: executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm', 
          bottom: '20mm',
          left: '15mm'
        }
      });

      console.log('✅ PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('❌ Error generando PDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}

export default SimplePuppeteerPDF;