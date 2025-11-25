import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PuppeteerPDF {
  static queue = [];
  static processing = false;
  static browser = null;
  static page = null;

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
    let page = null;
    
    try {
      console.log('=== GENERACIÓN PDF CON COLA ===');

      // Buscar Chrome en diferentes ubicaciones
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
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

      // Crear directorio temporal único con timestamp más preciso
      const tempDir = path.join(__dirname, '..', '..', 'temp_puppeteer');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const userDataDir = path.join(tempDir, `profile_${Date.now()}_${process.pid}_${Math.random().toString(36).substr(2, 9)}`);

      const browserOptions = {
        executablePath: executablePath,
        headless: true, // Usar 'true' en lugar de 'new' para puppeteer-core
        userDataDir: userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-translate',
          '--disable-extensions',
          '--remote-debugging-port=0', // Puerto aleatorio
          `--user-data-dir=${userDataDir}`
        ],
        timeout: 30000
      };

      console.log('Iniciando browser con userDataDir:', userDataDir);
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado exitosamente');

      page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      // Configurar timeout para la página
      page.setDefaultTimeout(30000);

      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Esperar un poco más para asegurar la renderización
      await new Promise(resolve => setTimeout(resolve, 1000));

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
      console.error('Error en generatePDF:', error);
      throw error;
    } finally {
      // Cerrar página y browser en orden
      if (page) {
        try {
          await page.close();
          console.log('Página cerrada');
        } catch (error) {
          console.error('Error cerrando página:', error.message);
        }
      }
      
      if (browser) {
        try {
          await browser.close();
          console.log('Browser cerrado');
          
          // Limpiar el directorio temporal después de cerrar el browser
          await this.cleanupUserDataDir(browser.options.userDataDir);
        } catch (error) {
          console.error('Error cerrando browser:', error.message);
          // Forzar limpieza si no se puede cerrar normalmente
          await this.forceCleanupUserDataDir(browser.options.userDataDir);
        }
      }
    }
  }

  static async cleanupUserDataDir(userDataDir) {
    try {
      if (fs.existsSync(userDataDir)) {
        setTimeout(() => {
          try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
            console.log('Directorio temporal limpiado:', userDataDir);
          } catch (error) {
            console.error('Error limpiando directorio temporal:', error.message);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Error en cleanupUserDataDir:', error.message);
    }
  }

  static async forceCleanupUserDataDir(userDataDir) {
    try {
      if (fs.existsSync(userDataDir)) {
        // En Windows, a veces necesitamos varios intentos
        for (let i = 0; i < 3; i++) {
          try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
            console.log('Directorio temporal forzadamente limpiado:', userDataDir);
            break;
          } catch (error) {
            if (i === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    } catch (error) {
      console.error('Error en forceCleanupUserDataDir:', error.message);
    }
  }
}

export default PuppeteerPDF;