# Holo

Tu escáner personal de cartas de Pokémon TCG: fotografías una carta, ves su precio en Cardmarket y la guardas en tu colección. Es una web app (PWA) que se instala en el móvil como cualquier otra app.

## Qué hace

- **Escanear**: encuadras la carta con la cámara y Holo la reconoce. Si solo hay una carta posible, abre su ficha directamente; si hay varias, te deja elegir.
- **Precio de Cardmarket**: tendencia, medias de 1, 7 y 30 días, precio medio de venta y precio más bajo, con precio aparte para la versión reverse holo.
- **Colección**: versión, estado (de Mint a Pobre, como en Cardmarket), idioma, cantidad, precio de compra y valor manual para cartas gradeadas.
- **Valor total e historial**: la gráfica guarda un punto al día, y verás cuánto ha subido o bajado y cuánto has ganado respecto a lo que pagaste.
- **Sets**: progreso de cada set con las cartas que tienes y las que te faltan, y un buscador de todos los sets.
- **Deseos**: lista de cartas que buscas con un precio objetivo; se marcan cuando están por debajo.
- **Copias de seguridad**: exportar e importar en JSON, y exportar a CSV para Excel.

## 1. Publicarla gratis con GitHub Pages (unos 5 minutos)

La cámara y los precios solo funcionan si la app está en una dirección `https://`, así que hay que alojarla. GitHub Pages es gratis.

1. Crea una cuenta en [github.com](https://github.com) si no la tienes.
2. Pulsa **New repository**. Ponle de nombre `holo`, déjalo como **Public** y pulsa **Create repository**.
3. En la página del repositorio, pulsa **uploading an existing file**. Descomprime el zip y arrastra **todo el contenido** de la carpeta (`index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest` y la carpeta `icons`). Pulsa **Commit changes**.
4. Ve a **Settings → Pages**. En *Source* elige **Deploy from a branch**, rama **main**, carpeta **/ (root)**, y pulsa **Save**.
5. En un minuto tendrás tu app en `https://TU-USUARIO.github.io/holo/`.

Sobre la privacidad: el código es público, pero tus cartas, tu historial y tu clave se guardan solo en tu móvil. Si alguien abre la dirección, verá una app vacía.

## 2. Instalarla en el móvil

- **Android (Chrome)**: abre la dirección, menú ⋮ → **Instalar app** (o *Añadir a pantalla de inicio*).
- **iPhone (Safari)**: abre la dirección, botón Compartir → **Añadir a pantalla de inicio**.

La primera vez que escanees, acepta el permiso de la cámara.

## 3. Reconocimiento: gratis o con Claude

- **Sin configurar nada** se usa un lector de texto gratuito que funciona en el propio móvil. Lee el número de la carta (por ejemplo `025/198`) y con eso la busca. Funciona bien con buena luz y la carta recta dentro del marco; la primera vez tarda unos segundos en prepararse. Si falla, corriges el número a mano y pulsas *Buscar carta*.
- **Con Claude** el reconocimiento es mucho más fiable, también con cartas en español, fundas o fotos torcidas. Necesitas una clave de API de Anthropic:
  1. Entra en [console.anthropic.com](https://console.anthropic.com), crea una cuenta y añade algo de saldo (se paga por uso; es independiente de la suscripción de Claude.ai).
  2. En **API Keys** crea una clave y cópiala.
  3. En Holo, ve a **Ajustes → Reconocimiento de cartas**, pégala y pulsa **Guardar clave**.

  Cada escaneo es una llamada pequeña con una foto. Te recomiendo poner un límite de gasto mensual en la consola. La clave se queda en tu móvil y nunca se incluye en las copias de seguridad.

## De dónde salen los precios

Holo usa la API gratuita de [TCGdex](https://tcgdex.dev), que incluye la guía de precios de Cardmarket (en euros) y se actualiza una vez al día. Holo actualiza los precios de tu colección solo al abrirla si han pasado más de 20 horas, o cuando pulsas *Actualizar precios*.

Ten en cuenta que:

- Son precios de cartas **sin gradear**. Para una carta gradeada, pon un valor manual en su ficha.
- Cardmarket da un precio para la versión normal y otro para la foil; Holo usa el foil para las **reverse holo**.
- La guía de Cardmarket no separa la **1ª edición** de las cartas antiguas ni el idioma, así que en esos casos el precio es orientativo.
- Las cartas **japonesas** tienen sus propios sets y no siempre coinciden con los de la base de datos internacional.
- El botón *Ver en Cardmarket* abre la búsqueda de Cardmarket con el nombre de la carta.

## Tus datos

Todo se guarda en el almacenamiento del navegador de tu móvil. Si borras los datos del navegador o desinstalas la app, se pierde. Usa **Ajustes → Exportar copia** de vez en cuando y guarda el archivo en tu nube.

## Actualizar la app

Si cambias algún archivo, súbelo de nuevo al repositorio. La app guarda una copia para funcionar sin conexión, así que verás los cambios después de cerrarla y abrirla un par de veces.

---

Holo es una herramienta personal y no está afiliada a The Pokémon Company, Nintendo ni Cardmarket.
