/**
 * Carrés pleins blancs et noirs alternés, animés par un bruit de Perlin.
 * Référence : Transformation 74.311 (1974), Vera Molnár.
 * Image : references/vera-molnar-transformation-74-311-1974.png
 *
 * On retient les carrés imbriqués et les petits écarts d'alignement.
 * Dessiner du plus grand au plus petit fait apparaître des bandes alternées.
 * Des variations continues font dériver, pencher et respirer les carrés.
 * Un slider Tweakpane permet de choisir le nombre de carrés.
 * Les voisins évoluent de façon proche, sans répéter une orbite régulière.
 */
const CONFIG = {
  count: 20,         // Nombre de carrés, réglable de 1 à 50 avec le slider.
  minSize: 28,       // Taille du plus petit carré, en unités du canvas.
  maxSize: 420,      // Taille du plus grand carré ; laisse une marge dans 640 × 640.
  amplitude: 32,    // Déplacement maximal autour du centre ; 0 supprime la dérive.
  noiseStep: 0.12,  // Écart dans le bruit entre voisins ; plus petit = plus solidaire.
  rotation: 0.12,   // Inclinaison maximale en radians, soit environ 7 degrés.
  deformation: 0.08, // Variation des côtés : 0.08 correspond à ±8 %.
  speed: 0.006,     // Avancée dans le bruit par image à 60 images/s ; augmente pour accélérer.
};

let time = 0;

async function setup() {
  // setup() s'exécute une seule fois. Les coordonnées restent en 640 × 640 :
  // le CSS adapte uniquement la taille affichée, sans redimensionner le dessin.
  createCanvas(640, 640);
  rectMode(CENTER); // rect(0, 0, ...) sera centré sur l'origine de son repère.
  noStroke(); // Les limites viennent des aplats alternés, sans contour ajouté.
  frameRate(60);
  // p5 attend la fin de setup() avant de lancer draw().
  // Import relatif : chaque version charge son propre fichier d'interface.
  const { createUI } = await import('./ui.js');
  createUI(CONFIG);
  describe('Des carrés blancs et noirs alternés bougent de façon organique. Un slider permet de choisir leur nombre.');
}

function draw() {
  // draw() se répète. Un fond noir opaque efface la position précédente,
  // afin que le mouvement reste lisible sans accumulation de traces.
  background(0);
  // deltaTime est en millisecondes. Ce rapport conserve la même vitesse
  // lorsque le navigateur ne dessine pas exactement 60 images par seconde.
  time += CONFIG.speed * deltaTime / (1000 / 60);

  push();
  translate(width / 2, height / 2); // Place l'origine au centre du canvas.

  // Les petits carrés sont dessinés après les grands pour rester visibles.
  for (let i = CONFIG.count - 1; i >= 0; i--) {
    // Le rapport va de 0 à 1 : il répartit les tailles entre les deux limites.
    // Math.max évite une division par zéro si l'on teste un seul carré.
    const ratio = i / Math.max(1, CONFIG.count - 1);
    const size = CONFIG.minSize + ratio * (CONFIG.maxSize - CONFIG.minSize);

    // noise() varie doucement entre 0 et 1. Des coordonnées proches donnent
    // des valeurs proches : les carrés voisins accompagnent la même dérive.
    const sample = i * CONFIG.noiseStep;

    // Soustraire 0.5 puis multiplier par 2 centre le mouvement entre -1 et 1.
    // Le décalage de 100 sépare les variations horizontales et verticales.
    // L'amplitude croît avec la taille : les petits carrés bougent moins.
    const amplitude = CONFIG.amplitude * ratio;
    const x = (noise(sample, time) * 2 - 1) * amplitude;
    const y = (noise(sample + 100, time) * 2 - 1) * amplitude;

    // D'autres zones du bruit font varier la rotation et les deux côtés.
    // Un temps plus lent fait respirer les dimensions sans pulsation mécanique.
    const tilt = (noise(sample + 200, time * 0.7) * 2 - 1) * CONFIG.rotation;
    const w = size * (1 + CONFIG.deformation * (noise(sample + 300, time * 0.6) * 2 - 1));
    const h = size * (1 + CONFIG.deformation * (noise(sample + 400, time * 0.6) * 2 - 1));

    // push()/pop() isolent les transformations de chaque carré :
    // on le déplace, puis on le tourne autour de son propre centre.
    push();
    translate(x, y);
    rotate(tilt);
    // layer compte depuis le plus grand carré. Le reste de la division par 2
    // alterne entre 0 et 1 : 255 donne du blanc, 0 du noir, tous deux opaques.
    const layer = CONFIG.count - 1 - i;
    fill(layer % 2 === 0 ? 255 : 0);
    rect(0, 0, w, h);
    pop();
  }
  pop(); // Rétablit le repère initial pour l'image suivante.
}
