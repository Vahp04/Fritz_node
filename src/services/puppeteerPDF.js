import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

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
    let browser = null;
    let userDataDir = null;
    
    try {
      console.log('=== GENERACIÓN PDF CON COLA ===');

      // Buscar Chrome
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
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

      // Crear directorio temporal único
      const tempDir = path.join(__dirname, '..', '..', 'temp_puppeteer');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      userDataDir = path.join(tempDir, `profile_${Date.now()}_${Math.random().toString(36).substring(7)}`);

      const browserOptions = {
        executablePath: executablePath,
        headless: true,
        userDataDir: userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
          '--disable-component-extensions-with-background-pages',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--remote-debugging-port=0'
        ],
        timeout: 30000
      };

      console.log('Lanzando browser con userDataDir único...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado');

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

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
      // Cerrar browser primero
      if (browser) {
        try {
          await browser.close();
          console.log('Browser cerrado');
        } catch (closeError) {
          console.error('Error cerrando browser:', closeError.message);
          await this.killChromeProcesses();
        }
      }
      
      // Limpiar directorio temporal después de cerrar el browser
      if (userDataDir) {
        await this.cleanupUserDataDir(userDataDir);
      }
    }
  }

  static async cleanupUserDataDir(userDataDir) {
    if (!fs.existsSync(userDataDir)) return;
    
    // Esperar un poco antes de limpiar
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
        console.log('Directorio temporal limpiado:', userDataDir);
        break;
      } catch (error) {
        console.log(`Intento ${attempt + 1} de limpieza falló:`, error.message);
        if (attempt === 2) {
          console.error('No se pudo limpiar el directorio:', userDataDir);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  static async killChromeProcesses() {
    return new Promise((resolve) => {
      try {
        const taskkill = spawn('taskkill', ['/f', '/im', 'chrome.exe', '/t']);
        taskkill.on('close', () => resolve());
        taskkill.on('error', () => resolve());
        setTimeout(resolve, 3000);
      } catch (error) {
        resolve();
      }
    });
  }
}

export default PuppeteerPDF;