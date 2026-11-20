// Engine: p5.js
/**
 * Carrés pleins blancs et noirs alternés, animés avec sin() et cos().
 * Référence : Transformation 74.311 (1974), Vera Molnár.
 * Image : references/vera-molnar-transformation-74-311-1974.png
 *
 * On retient les carrés imbriqués et les petits écarts d'alignement.
 * Dessiner du plus grand au plus petit fait apparaître des bandes alternées.
 * Une même oscillation, décalée pour chaque carré, anime cette structure.
 */
const CONFIG = {
  count: 20,         // Nombre de carrés ; plus grand = une structure plus dense.
  minSize: 28,       // Taille du plus petit carré, en unités du canvas.
  maxSize: 420,      // Taille du plus grand carré ; laisse une marge dans 640 × 640.
  amplitude: 22,    // Déplacement maximal autour du centre ; 0 supprime les orbites.
  phaseStep: 0.35,  // Décalage entre voisins, en radians ; 0 synchronise les carrés.
  rotation: 0.07,   // Inclinaison maximale en radians, soit environ 4 degrés.
  deformation: 0.06, // Variation des côtés : 0.06 correspond à ±6 %.
  speed: 0.018,     // Avancée du temps par image, en radians ; augmente pour accélérer.
};

let time = 0;

function setup() {
  // setup() s'exécute une seule fois. Les coordonnées restent en 640 × 640 :
  // le CSS adapte uniquement la taille affichée, sans redimensionner le dessin.
  createCanvas(640, 640);
  rectMode(CENTER); // rect(0, 0, ...) sera centré sur l'origine de son repère.
  noStroke(); // Les limites viennent des aplats alternés, sans contour ajouté.
  frameRate(60);
  describe('Vingt carrés pleins, blancs et noirs en alternance, oscillent et se déforment légèrement sur fond noir.');
}

function draw() {
  // draw() se répète. Un fond noir opaque efface la position précédente,
  // afin que le mouvement reste lisible sans accumulation de traces.
  background(0);
  time += CONFIG.speed;

  push();
  translate(width / 2, height / 2); // Place l'origine au centre du canvas.

  // Les petits carrés sont dessinés après les grands pour rester visibles.
  for (let i = CONFIG.count - 1; i >= 0; i--) {
    // Le rapport va de 0 à 1 : il répartit les tailles entre les deux limites.
    // Math.max évite une division par zéro si l'on teste un seul carré.
    const ratio = i / Math.max(1, CONFIG.count - 1);
    const size = CONFIG.minSize + ratio * (CONFIG.maxSize - CONFIG.minSize);

    // Une phase décale une oscillation dans le temps. Chaque carré a la sienne :
    // l'ensemble semble onduler plutôt que bouger comme un bloc rigide.
    const phase = i * CONFIG.phaseStep;
    const angle = time + phase;

    // sin() et cos() varient entre -1 et 1. Leur combinaison dessine une orbite.
    // On multiplie par une amplitude croissante : les petits carrés bougent moins.
    const amplitude = CONFIG.amplitude * ratio;
    const x = cos(angle) * amplitude;
    const y = sin(angle) * amplitude;

    // Ajouter 1 garde les dimensions autour de leur valeur de départ.
    // Le facteur 2 fait respirer les côtés deux fois par tour orbital.
    const w = size * (1 + CONFIG.deformation * sin(time * 2 + phase));
    const h = size * (1 + CONFIG.deformation * cos(time * 2 + phase));

    // push()/pop() isolent les transformations de chaque carré :
    // on le déplace, puis on le tourne autour de son propre centre.
    push();
    translate(x, y);
    rotate(sin(angle) * CONFIG.rotation);
    // layer compte depuis le plus grand carré. Le reste de la division par 2
    // alterne entre 0 et 1 : 255 donne du blanc, 0 du noir, tous deux opaques.
    const layer = CONFIG.count - 1 - i;
    fill(layer % 2 === 0 ? 255 : 0);
    rect(0, 0, w, h);
    pop();
  }
  pop(); // Rétablit le repère initial pour l'image suivante.
}
