// PuppeteerPDF.js - Usar Chrome del sistema
import puppeteer from 'puppeteer';
import { existsSync } from 'fs';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('=== BUSCANDO CHROME EN EL SISTEMA ===');
      
      // Buscar Chrome en rutas comunes del sistema
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
      ];
      
      let executablePath = '';
      for (const path of possiblePaths) {
        if (existsSync(path)) {
          executablePath = path;
          console.log('Chrome encontrado en:', path);
          break;
        }
      }
      
      if (!executablePath) {
        console.log('Chrome no encontrado en rutas del sistema');
        console.log('Usando Chromium incluido con Puppeteer');
      }

      const browserOptions = {
        executablePath: executablePath || undefined, // Si no hay path, usa el de Puppeteer
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--single-process'
        ],
        timeout: 30000
      };

      console.log('Lanzando navegador...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Navegador lanzado exitosamente');

      const page = await browser.newPage();
      page.setDefaultTimeout(15000);

      console.log('Cargando contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 10000
      });

      console.log('Esperando renderizado...');
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

      console.log(`PDF generado exitosamente - ${pdfBuffer.length} bytes`);
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR en generatePDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
      }
    }
  }
}

export default PuppeteerPDF;