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
  static activeInstances = new Set();

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
    const instanceId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      console.log(`=== GENERACIÓN PDF [${instanceId}] ===`);

      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
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

      // Usar el directorio temporal del sistema con un nombre más único
      const userDataDir = path.join(require('os').tmpdir(), `puppeteer_${instanceId}`);
      
      // Asegurarse de que el directorio no exista
      await this.forceDeleteDirectory(userDataDir);

      const browserOptions = {
        executablePath: executablePath,
        headless: true,
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
          '--remote-debugging-port=0',
          '--disable-features=TranslateUI',
          '--disable-component-extensions-with-background-pages',
          `--user-data-dir=${userDataDir}`
        ],
        timeout: 30000
      };

      console.log(`[${instanceId}] Iniciando browser...`);
      this.activeInstances.add(instanceId);
      
      browser = await puppeteer.launch(browserOptions);
      console.log(`[${instanceId}] Browser iniciado exitosamente`);

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      page.setDefaultTimeout(30000);

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
        },
        timeout: 30000
      });

      console.log(`[${instanceId}] PDF generado exitosamente`);
      return pdfBuffer;

    } catch (error) {
      console.error(`[${instanceId}] Error en generatePDF:`, error.message);
      
      // Forzar cierre de procesos de Chrome huérfanos
      await this.killChromeProcesses();
      throw error;
      
    } finally {
      this.activeInstances.delete(instanceId);
      
      // Cerrar browser y limpiar de forma agresiva
      if (browser) {
        try {
          const userDataDir = browser.options.userDataDir;
          await browser.close();
          console.log(`[${instanceId}] Browser cerrado`);
          
          // Limpieza agresiva del directorio
          setTimeout(() => {
            this.forceDeleteDirectory(userDataDir).catch(() => {});
          }, 1000);
          
        } catch (closeError) {
          console.error(`[${instanceId}] Error cerrando browser:`, closeError.message);
          // Si no se puede cerrar, matar procesos
          await this.killChromeProcesses();
        }
      }
    }
  }

  static async forceDeleteDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Usar diferentes métodos de eliminación
        fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3 });
        console.log('Directorio eliminado:', dirPath);
        break;
      } catch (error) {
        console.log(`Intento ${attempt + 1} de eliminar directorio falló:`, error.message);
        
        if (attempt === 2) {
          console.error('No se pudo eliminar el directorio:', dirPath);
          break;
        }
        
        // Esperar y intentar cerrar procesos de Chrome
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.killChromeProcesses();
      }
    }
  }

  static async killChromeProcesses() {
    return new Promise((resolve) => {
      try {
        // Usar taskkill para forzar cierre de procesos Chrome
        const taskkill = spawn('taskkill', ['/f', '/im', 'chrome.exe', '/t']);
        
        taskkill.on('close', (code) => {
          if (code === 0) {
            console.log('Procesos Chrome terminados forzosamente');
          }
          resolve();
        });
        
        taskkill.on('error', () => resolve());
        
        // Timeout por si acaso
        setTimeout(resolve, 5000);
      } catch (error) {
        console.error('Error terminando procesos Chrome:', error.message);
        resolve();
      }
    });
  }

  // Método para limpiar todos los directorios temporales al iniciar la aplicación
  static async cleanupOldTempFiles() {
    const tempDir = require('os').tmpdir();
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        if (file.startsWith('puppeteer_')) {
          const fullPath = path.join(tempDir, file);
          this.forceDeleteDirectory(fullPath).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Error limpiando archivos temporales viejos:', error.message);
    }
  }
}

// Limpiar archivos temporales al cargar el módulo
PuppeteerPDF.cleanupOldTempFiles().catch(() => {});

export default PuppeteerPDF;