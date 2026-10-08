import type { Metadata } from "next";
import { BASE_PATH } from "@/lib/asset";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mystic Sand",
  robots: { index: false, follow: false },
};

// Static export has no proxy, so "/" picks the language in the browser:
// a saved choice wins, otherwise the browser language, otherwise English.
const redirectScript = `(function(){var b=${JSON.stringify(BASE_PATH)};var l=null;try{l=localStorage.getItem('ms-locale')}catch(e){}if(l!=='en'&&l!=='ar'){l='en';var a=navigator.languages||[navigator.language||'en'];for(var i=0;i<a.length;i++){var x=String(a[i]||'').toLowerCase();if(x.indexOf('ar')===0){l='ar';break}if(x.indexOf('en')===0){break}}}location.replace(b+'/'+l+'/'+location.search+location.hash)})();`;

export default function RootSplash() {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: redirectScript }} />
      </head>
      <body className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-sand text-ink">
        <p className="font-serif text-3xl tracking-[0.2em]">MYSTIC SAND</p>
        <nav className="flex gap-6 text-sm">
          <a className="underline underline-offset-4" href={`${BASE_PATH}/en/`}>
            English
          </a>
          <a className="underline underline-offset-4" href={`${BASE_PATH}/ar/`} lang="ar">
            العربية
          </a>
        </nav>
      </body>
    </html>
  );
}
