import puppeteer from 'puppeteer-core';
import fs from 'fs';

class PuppeteerPDF {
  static queue = [];
  static processing = false;
  static browserInstance = null;
  static browserInitializing = false;

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

  static async getBrowserInstance() {
    // Si ya tenemos una instancia, retornarla
    if (this.browserInstance) {
      return this.browserInstance;
    }

    // Si se está inicializando, esperar
    if (this.browserInitializing) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.getBrowserInstance();
    }

    this.browserInitializing = true;

    try {
      console.log('=== INICIALIZANDO BROWSER PERSISTENTE ===');

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
          '--disable-renderer-backgrounding'
        ],
        timeout: 30000
      };

      console.log('Lanzando browser persistente...');
      this.browserInstance = await puppeteer.launch(browserOptions);
      console.log('✅ Browser persistente iniciado');

      // Manejar cierre inesperado del browser
      this.browserInstance.on('disconnected', () => {
        console.log('⚠️ Browser desconectado, reiniciando...');
        this.browserInstance = null;
        this.browserInitializing = false;
      });

      return this.browserInstance;

    } catch (error) {
      this.browserInitializing = false;
      console.error('Error inicializando browser:', error);
      throw error;
    }
  }

  static async _generatePDFInternal(htmlContent, options = {}) {
    let page = null;
    
    try {
      console.log('=== GENERACIÓN PDF CON BROWSER PERSISTENTE ===');

      const browser = await this.getBrowserInstance();
      
      console.log('Creando nueva página...');
      page = await browser.newPage();
      
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
        }
      });

      console.log('✅ PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('❌ Error en generatePDF:', error.message);
      
      // Si el error es por browser desconectado, resetear la instancia
      if (error.message.includes('Target closed') || error.message.includes('Session closed')) {
        console.log('🔄 Reiniciando browser por error de conexión...');
        this.browserInstance = null;
        this.browserInitializing = false;
      }
      
      throw error;
    } finally {
      if (page) {
        try {
          await page.close();
          console.log('📄 Página cerrada');
        } catch (closeError) {
          console.error('Error cerrando página:', closeError.message);
        }
      }
    }
  }

  // Método para cerrar el browser manualmente si es necesario
  static async closeBrowser() {
    if (this.browserInstance) {
      try {
        await this.browserInstance.close();
        console.log('🔴 Browser persistente cerrado');
      } catch (error) {
        console.error('Error cerrando browser:', error.message);
      } finally {
        this.browserInstance = null;
        this.browserInitializing = false;
      }
    }
  }

  // Limpiar al cerrar la aplicación
  static async cleanup() {
    await this.closeBrowser();
  }
}

// Cerrar el browser cuando se cierra la aplicación
process.on('beforeExit', async () => {
  await PuppeteerPDF.cleanup();
});

process.on('SIGINT', async () => {
  await PuppeteerPDF.cleanup();
  process.exit(0);
});

export default PuppeteerPDF;