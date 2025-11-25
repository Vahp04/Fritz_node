import puppeteer from 'puppeteer';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('Iniciando generación de PDF...');

      // CONFIGURACIÓN MÍNIMA Y ESTABLE
      const browserOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions'
        ],
        ignoreHTTPSErrors: true
      };

      console.log('Configuración del navegador lista');
      browser = await puppeteer.launch(browserOptions);
      console.log('Navegador lanzado exitosamente');

      const page = await browser.newPage();
      
      // Configurar viewport
      await page.setViewport({ 
        width: 1200, 
        height: 800 
      });

      console.log('Cargando contenido HTML...');
      
      // Cargar contenido SIN timeout excesivo
      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded'
      });

      console.log('Esperando renderizado...');
      // Espera mínima
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('Generando PDF...');
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

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('PDF generado está vacío');
      }

      console.log('PDF generado exitosamente - Tamaño:', pdfBuffer.length, 'bytes');
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR CRÍTICO en generatePDF:', error.message);
      
      // Manejo específico de errores comunes
      if (error.message.includes('Target closed')) {
        throw new Error('El navegador se cerró abruptamente. Posible falta de memoria.');
      }
      if (error.message.includes('Protocol error')) {
        throw new Error('Error de comunicación con el navegador.');
      }
      
      throw error;
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('Navegador cerrado');
        } catch (closeError) {
          console.log('Error al cerrar navegador (normal):', closeError.message);
        }
      }
    }
  }
}

export default PuppeteerPDF;