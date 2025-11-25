import puppeteer from 'puppeteer';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

class PDFService {
  static browser = null;
  static initializationPromise = null;
  static isInitializing = false;

  static async getBrowser() {
    if (this.browser && await this.isBrowserConnected()) {
      return this.browser;
    }

    if (this.isInitializing) {
      return this.initializationPromise;
    }

    this.isInitializing = true;
    
    this.initializationPromise = (async () => {
      try {
        console.log('🔄 Iniciando browser Puppeteer...');
        
        // Forzar cierre de procesos Chrome existentes
        await this.killChromeProcesses();

        // Buscar Chrome instalado
        const executablePath = await this.findChromePath();
        
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
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--remote-debugging-port=0'
          ],
          timeout: 30000
        };

        console.log('🚀 Lanzando browser...');
        this.browser = await puppeteer.launch(browserOptions);
        console.log('✅ Browser iniciado exitosamente');

        // Manejar desconexión
        this.browser.on('disconnected', () => {
          console.log('⚠️ Browser desconectado');
          this.browser = null;
          this.isInitializing = false;
          this.initializationPromise = null;
        });

        return this.browser;

      } catch (error) {
        console.error('❌ Error iniciando browser:', error);
        this.browser = null;
        this.isInitializing = false;
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  static async isBrowserConnected() {
    try {
      if (this.browser) {
        const pages = await this.browser.pages();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  static async findChromePath() {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
    ];

    for (const chromePath of chromePaths) {
      if (fs.existsSync(chromePath)) {
        console.log('✅ Chrome encontrado:', chromePath);
        return chromePath;
      }
    }

    // Si no encuentra Chrome, usar el de Puppeteer
    console.log('⚠️ Usando Chrome incluido con Puppeteer');
    return null;
  }

  static async generatePDF(htmlContent, options = {}) {
    let browser = null;
    let page = null;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        console.log(`🔄 Intento ${retryCount + 1} de generar PDF...`);
        
        browser = await this.getBrowser();
        
        console.log('📄 Creando nueva página...');
        page = await browser.newPage();
        
        // Configurar viewport y timeouts
        await page.setViewport({ width: 1200, height: 800 });
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(30000);

        // Configurar manejo de recursos
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          // Bloquear imágenes externas para mayor velocidad
          if (request.resourceType() === 'image') {
            request.abort();
          } else {
            request.continue();
          }
        });

        console.log('📝 Estableciendo contenido HTML...');
        await page.setContent(htmlContent, {
          waitUntil: ['domcontentloaded', 'networkidle0'],
          timeout: 30000
        });

        // Esperar a que se rendericen los estilos
        await page.evaluate(() => {
          return new Promise((resolve) => {
            if (document.readyState === 'complete') {
              resolve();
            } else {
              window.addEventListener('load', resolve, { once: true });
            }
          });
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('📊 Generando PDF...');
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

        console.log('✅ PDF generado exitosamente');
        return pdfBuffer;

      } catch (error) {
        console.error(`❌ Error en intento ${retryCount + 1}:`, error.message);
        
        // Limpiar recursos
        if (page) {
          try {
            await page.close();
          } catch (e) {}
          page = null;
        }

        if (browser) {
          try {
            await browser.close();
          } catch (e) {}
          browser = null;
          this.browser = null;
          this.isInitializing = false;
          this.initializationPromise = null;
        }

        // Forzar limpieza de procesos
        await this.killChromeProcesses();

        if (retryCount === maxRetries) {
          throw new Error(`No se pudo generar el PDF después de ${maxRetries + 1} intentos: ${error.message}`);
        }

        retryCount++;
        // Esperar antes del reintento
        await new Promise(resolve => setTimeout(resolve, 2000));
      } finally {
        if (page) {
          try {
            await page.close();
          } catch (e) {}
        }
      }
    }
  }

  static async killChromeProcesses() {
    return new Promise((resolve) => {
      try {
        console.log('🔴 Terminando procesos Chrome...');
        
        if (os.platform() === 'win32') {
          // Windows
          const taskkill = spawn('taskkill', ['/f', '/im', 'chrome.exe', '/t']);
          taskkill.on('close', () => resolve());
          taskkill.on('error', () => resolve());
        } else {
          // Linux/Mac
          try {
            execSync('pkill -f chrome', { stdio: 'ignore' });
          } catch (e) {}
          resolve();
        }
        
        // Timeout de seguridad
        setTimeout(resolve, 5000);
      } catch (error) {
        console.error('Error terminando procesos Chrome:', error.message);
        resolve();
      }
    });
  }

  static async close() {
    if (this.browser) {
      try {
        await this.browser.close();
        console.log('🔴 Browser cerrado');
      } catch (error) {
        console.error('Error cerrando browser:', error.message);
      } finally {
        this.browser = null;
        this.isInitializing = false;
        this.initializationPromise = null;
      }
    }
    await this.killChromeProcesses();
  }
}

// Manejar cierre graceful de la aplicación
process.on('beforeExit', async () => {
  await PDFService.close();
});

process.on('SIGINT', async () => {
  await PDFService.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await PDFService.close();
  process.exit(0);
});

export default PDFService;