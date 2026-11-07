import Link from "next/link";
import menuPhotos from "../../../prisma/catalog/photo-sources.json";
export default function PhotoCredits() {
  return <main className="page"><section className="panel" style={{ padding: 28, fontSize: 16, lineHeight: 1.7 }}>
    <h1>Photo credits</h1><p>These photographs illustrate the demo menu. Actual preparation, garnish and serving sizes may differ. Confirm the restaurant’s own photographs and allergen declarations before launch.</p>
    <ul>
      <li><a href="https://commons.wikimedia.org/wiki/File:Hyderabadi_Mutton_Haleem.jpg">Hyderabadi Mutton Haleem</a> by Pumpkinspice1996, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</li>
      <li><a href="https://commons.wikimedia.org/wiki/File:Cucumber-raita.jpg">Cucumber raita</a> by Sonia Goyal, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>.</li>
      <li><a href="https://commons.wikimedia.org/wiki/File:Gulab-jamun-wallpaper-1.jpg">Gulab jamun</a> by Sapra5379, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</li>
      {menuPhotos.map(photo => <li key={photo.id}>
        <a href={photo.sourceUrl}>{photo.title}</a> by {photo.author}, <a href={photo.licenseUrl}>{photo.license}</a>.
      </li>)}
    </ul><p>These images are resized and JPEG-compressed; displayed crops vary by screen. Adaptations remain under their respective licences. Chicken biryani, vegetable biryani, mirchi ka salan and double ka meetha images were supplied with the assessment; commercial usage rights still need owner confirmation.</p>
    <Link href="/">Back to the menu</Link>
  </section></main>;
}
