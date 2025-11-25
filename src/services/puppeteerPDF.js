// PuppeteerPDF.js - Con ruta específica de Chrome
import puppeteer from 'puppeteer-core';
import fs from 'fs';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('=== INICIANDO GENERACIÓN DE PDF ===');
      
      // Rutas posibles de Chrome en Windows
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
      ];

      let chromePath = '';
      for (const path of chromePaths) {
        if (fs.existsSync(path)) {
          chromePath = path;
          console.log('Chrome encontrado en:', path);
          break;
        }
      }

      if (!chromePath) {
        throw new Error('No se encontró Chrome instalado en las rutas comunes');
      }

      // Configuración simple
      const browserOptions = {
        executablePath: chromePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer'
        ],
        timeout: 30000
      };

      console.log('Lanzando Chrome...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Chrome lanzado exitosamente');

      const page = await browser.newPage();
      page.setDefaultTimeout(15000);

      console.log('Cargando contenido...');
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 10000
      });

      // Pequeña espera para renderizado
      await page.waitForTimeout(1000);

      console.log('Generando PDF...');
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

      console.log(`PDF generado - ${pdfBuffer.length} bytes`);
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
      }
    }
  }
}

export default PuppeteerPDF;