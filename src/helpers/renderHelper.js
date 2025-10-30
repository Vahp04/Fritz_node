// Función helper para renderizar templates en controladores
export const renderTemplate = (app, view, data) => {
  return new Promise((resolve, reject) => {
    app.render(view, data, (err, html) => {
      if (err) reject(err);
      else resolve(html);
    });
  });
};

// Exportación por defecto también
export default renderTemplate;