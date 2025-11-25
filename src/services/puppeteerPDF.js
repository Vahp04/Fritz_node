import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    let browser;
    
    try {
      console.log('=== GENERACIÓN PDF CON COLA ===');

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

      // Crear directorio temporal único para esta instancia
      const tempDir = path.join(__dirname, '..', '..', 'temp_puppeteer');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const userDataDir = path.join(tempDir, `profile_${Date.now()}_${Math.random().toString(36).substring(7)}`);

      const browserOptions = {
        headless: 'new',
        executablePath: executablePath,
        userDataDir: userDataDir, // Directorio único por instancia
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-gpu',
          '--single-process',
          '--disable-features=VizDisplayCompositor'
        ],
        timeout: 30000 // Aumentar timeout
      };

      console.log('Lanzando browser...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado');

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0', // Cambiar a networkidle0 para mejor espera
        timeout: 30000
      });

      // Esperar a que se carguen recursos externos si los hay
      await new Promise(resolve => setTimeout(resolve, 500));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm', 
          bottom: '20mm',
          left: '15mm'
        },
        timeout: 30000
      });

      console.log('PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('Browser cerrado');
        } catch (closeError) {
          console.error('Error cerrando browser:', closeError.message);
        }
      }
    }
  }

  // Método para limpiar directorios temporales (opcional)
  static async cleanupTempFiles() {
    const tempDir = path.join(__dirname, '..', '..', 'temp_puppeteer');
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('Directorio temporal limpiado');
      } catch (error) {
        console.error('Error limpiando directorio temporal:', error.message);
      }
    }
  }
}

export default PuppeteerPDF;