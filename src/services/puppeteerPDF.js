import puppeteer from 'puppeteer';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('Iniciando generación de PDF con Puppeteer...');
      
      const browserOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--font-render-hinting=none',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        timeout: 60000
      };

      browser = await puppeteer.launch(browserOptions);
      const page = await browser.newPage();

      // Configurar el viewport
      await page.setViewport({ width: 1200, height: 800 });

      // Configurar timeout de la página
      page.setDefaultTimeout(60000);

      // Configurar el contenido HTML con manejo de errores
      try {
        await page.setContent(htmlContent, {
          waitUntil: ['load', 'networkidle0', 'domcontentloaded'],
          timeout: 60000
        });
      } catch (contentError) {
        console.warn('Error en setContent, continuando...', contentError.message);
      }

      // Esperar a que las fuentes se carguen
      try {
        await page.evaluateHandle('document.fonts.ready');
      } catch (fontError) {
        console.warn('Error cargando fuentes:', fontError.message);
      }

      // Esperar un poco más para asegurar la renderización
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Configurar opciones del PDF más robustas
      const pdfOptions = {
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        omitBackground: false,
        timeout: 60000,
        margin: {
          top: options.marginTop || '20mm',
          right: options.marginRight || '15mm',
          bottom: options.marginBottom || '20mm',
          left: options.marginLeft || '15mm'
        }
      };

      console.log('Generando PDF buffer...');
      const pdfBuffer = await page.pdf(pdfOptions);
      
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('El PDF generado está vacío');
      }

      console.log('PDF generado exitosamente, tamaño:', pdfBuffer.length, 'bytes');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
      }
    }
  }
}

export default PuppeteerPDF;