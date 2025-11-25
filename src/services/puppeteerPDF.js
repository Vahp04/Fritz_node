import puppeteer from 'puppeteer';

class PuppeteerPDF {
  static queue = [];
  static processing = false;

  static async generatePDF(htmlContent, options = {}) {
    // Agregar a la cola y esperar turno
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
      this.processQueue(); // Procesar siguiente tarea
    }
  }

  static async _generatePDFInternal(htmlContent, options = {}) {
    let browser = null;
    
    try {
      console.log('=== GENERACIÓN PDF CON COLA ===');

      const browserOptions = {
        headless: 'new', // Modo headless moderno
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions'
        ],
        timeout: 30000
      };

      console.log('Lanzando browser...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado');

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

      console.log('PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
        console.log('Browser cerrado');
      }
    }
  }
}

export default PuppeteerPDF;