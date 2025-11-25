import puppeteer from 'puppeteer';

class StablePuppeteerPDF {
  static browser = null;
  static initializationPromise = null;
  static isInitializing = false;

  static async getBrowser() {
    // Si ya está inicializado, retornar el browser
    if (this.browser) {
      return this.browser;
    }

    // Si se está inicializando, esperar a que termine
    if (this.isInitializing) {
      return this.initializationPromise;
    }

    this.isInitializing = true;
    
    this.initializationPromise = (async () => {
      try {
        console.log('Iniciando browser Puppeteer...');
        
        this.browser = await puppeteer.launch({
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
        });

        console.log('Browser Puppeteer iniciado exitosamente');
        return this.browser;

      } catch (error) {
        console.error('Error iniciando browser:', error);
        this.browser = null;
        this.isInitializing = false;
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  static async generatePDF(htmlContent, options = {}) {
    let page = null;
    
    try {
      const browser = await this.getBrowser();
      
      console.log('Creando nueva página...');
      page = await browser.newPage();
      
      await page.setViewport({ width: 1200, height: 800 });
      page.setDefaultTimeout(30000);

      console.log('Estableciendo contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Esperar a que se renderice completamente
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Generando PDF...');
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
      console.error('Error generando PDF:', error);
      
      // Si el error es por conexión del browser, reiniciarlo
      if (error.message.includes('Target closed') || error.message.includes('Session closed')) {
        await this.restartBrowser();
      }
      
      throw error;
    } finally {
      if (page) {
        try {
          await page.close();
          console.log('Página cerrada');
        } catch (closeError) {
          console.error('Error cerrando página:', closeError);
        }
      }
    }
  }

  static async restartBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error('Error cerrando browser:', error);
      }
    }
    
    this.browser = null;
    this.isInitializing = false;
    this.initializationPromise = null;
    
    // Forzar cierre de procesos Chrome huérfanos
    await this.killChromeProcesses();
  }

  static async killChromeProcesses() {
    const { spawn } = await import('child_process');
    
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

  static async close() {
    await this.restartBrowser();
  }
}

// Cerrar el browser cuando se cierra la aplicación
process.on('beforeExit', async () => {
  await StablePuppeteerPDF.close();
});

process.on('SIGINT', async () => {
  await StablePuppeteerPDF.close();
  process.exit(0);
});

export default StablePuppeteerPDF;