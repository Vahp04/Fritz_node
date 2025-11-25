import puppeteer from 'puppeteer-core';
import fs from 'fs';

class PuppeteerPDF {
  static queue = [];
  static processing = false;

  static async generatePDF(htmlContent, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ htmlContent, options, resolve, reject });
      this.processQueue();
    });
  }

  static async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const task = this.queue.shift();
    
    try {
      console.log('Procesando tarea PDF en cola...');
      const result = await this._generatePDFInternal(task.htmlContent, task.options);
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.processing = false;
      this.processQueue();
    }
  }

  static async _generatePDFInternal(htmlContent, options = {}) {
    let browser = null;
    
    try {
      console.log('=== GENERACIÓN PDF CON COLA ===');

      // Buscar Chrome en rutas comunes del servidor Windows
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'D:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'D:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
      ];

      let executablePath = null;
      for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
          executablePath = chromePath;
          console.log('Chrome encontrado en servidor:', executablePath);
          break;
        }
      }

      if (!executablePath) {
        // Si no encuentra Chrome, intentar usar where para buscar en PATH
        try {
          const { execSync } = await import('child_process');
          const chromePath = execSync('where chrome.exe', { encoding: 'utf8' }).split('\n')[0].trim();
          if (chromePath && fs.existsSync(chromePath)) {
            executablePath = chromePath;
            console.log('Chrome encontrado via where:', executablePath);
          }
        } catch (e) {
          console.log('No se pudo encontrar Chrome via where');
        }
      }

      if (!executablePath) {
        throw new Error('No se encontró Chrome instalado en el servidor. Rutas verificadas: ' + chromePaths.join(', '));
      }

      const browserOptions = {
        executablePath: executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
          '--single-process'
        ],
        timeout: 30000
      };

      console.log('Lanzando browser en servidor...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado en servidor');

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 200));

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

      console.log('PDF generado exitosamente en servidor');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF en servidor:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
        console.log('Browser cerrado en servidor');
      }
    }
  }
}

export default PuppeteerPDF;