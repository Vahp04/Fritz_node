import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';

class PuppeteerPDF {
  static browserInstance = null;
  static isInitializing = false;
  static userDataDir = path.join(os.tmpdir(), 'puppeteer_shared_profile');

  static async getBrowser() {
    // Si ya está inicializando, esperar
    while (this.isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.browserInstance) {
      this.isInitializing = true;
      try {
        console.log('=== INICIANDO BROWSER COMPARTIDO ===');

        const chromePaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
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

        // Crear directorio compartido
        if (!fs.existsSync(this.userDataDir)) {
          fs.mkdirSync(this.userDataDir, { recursive: true });
        }

        const browserOptions = {
          headless: 'new',
          executablePath: executablePath,
          userDataDir: this.userDataDir,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--disable-gpu'
          ]
        };

        this.browserInstance = await puppeteer.launch(browserOptions);
        console.log('Browser compartido iniciado');

        // Manejar cierre graceful
        process.on('beforeExit', async () => {
          if (this.browserInstance) {
            await this.browserInstance.close();
          }
        });

      } finally {
        this.isInitializing = false;
      }
    }

    return this.browserInstance;
  }

  static async generatePDF(htmlContent, options = {}) {
    let page;
    
    try {
      console.log('=== GENERANDO PDF CON BROWSER COMPARTIDO ===');
      
      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setViewport({ width: 1200, height: 800 });
      page.setDefaultTimeout(60000);

      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      await page.evaluateHandle('document.fonts.ready');
      await new Promise(resolve => setTimeout(resolve, 500));

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

      console.log('PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error.message);
      throw error;
    } finally {
      if (page) {
        await page.close().catch(console.error);
      }
    }
  }

  static async closeBrowser() {
    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = null;
      
      // Limpiar directorio compartido
      if (fs.existsSync(this.userDataDir)) {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      }
    }
  }
}

export default PuppeteerPDF;