import puppeteer from 'puppeteer';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('Iniciando generación de PDF...');

      // Configuración optimizada para Windows Server
      const browserOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-web-security',
          '--no-first-run',
          '--no-zygote',
          '--single-process', // Importante para estabilidad
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--max-old-space-size=2048'
        ],
        timeout: 30000,
        dumpio: false // Reducir logs
      };

      console.log('Lanzando navegador con Chromium de Puppeteer...');
      browser = await puppeteer.launch(browserOptions);
      
      const page = await browser.newPage();
      
      // Timeouts realistas
      page.setDefaultTimeout(45000);
      page.setDefaultNavigationTimeout(45000);

      await page.setViewport({ 
        width: 1200, 
        height: 800 
      });

      console.log('Cargando contenido HTML...');
      
      // Cargar contenido de forma eficiente
      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });

      // Espera corta para renderizado
      await new Promise(resolve => setTimeout(resolve, 1000));

      const pdfOptions = {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      };

      console.log('Generando PDF...');
      const pdfBuffer = await page.pdf(pdfOptions);
      
      console.log('PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error.message);
      throw new Error(`Error generando PDF: ${error.message}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          // Ignorar errores al cerrar
        }
      }
    }
  }
}

export default PuppeteerPDF;