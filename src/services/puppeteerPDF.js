import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    let userDataDir = null;
    
    try {
      console.log('Iniciando generación de PDF con Puppeteer...');
      
      // Rutas posibles de Chrome en Windows
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      ];

      let executablePath = null;
      for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
          executablePath = chromePath;
          console.log('Chrome encontrado en:', executablePath);
          break;
        }
      }

      if (!executablePath) {
        throw new Error(`
          Chrome no encontrado en el sistema. Soluciones:
          1. Instalar Chrome en el servidor
          2. Cambiar a: npm install puppeteer (incluye Chromium)
          3. Verificar la instalación de Chrome
          
          Rutas verificadas:
          ${chromePaths.join('\n')}
        `);
      }

      // Crear directorio temporal único
      userDataDir = path.join(os.tmpdir(), `puppeteer_${Date.now()}`);
      
      const browserOptions = {
        headless: true,
        executablePath: executablePath,
        userDataDir: userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        timeout: 60000
      };

      console.log('Lanzando Chrome...');
      browser = await puppeteer.launch(browserOptions);
      
      // ... resto del código igual a la solución anterior
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      // ... etc

      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
      }
    }
  }
}

export default PuppeteerPDF;