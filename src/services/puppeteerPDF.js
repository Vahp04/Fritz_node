import puppeteer from 'puppeteer';
import fs from 'fs';

class PuppeteerPDF {
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
        console.log('Chrome encontrado en:', chromePath);
        return chromePath;
      }
    }
    
    throw new Error('No se pudo encontrar Chrome instalado en el sistema');
  }

  static async generatePDF(htmlContent) {
    let browser = null;
    
    try {
      console.log('Iniciando generación de PDF...');
      
      const executablePath = await this.findChromePath();
      
      browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions'
        ],
        timeout: 30000
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Esperar a que se renderice
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
      console.error('Error generando PDF:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
        console.log('Browser cerrado');
      }
    }
  }
}

export default PuppeteerPDF;