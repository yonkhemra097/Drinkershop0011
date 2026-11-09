"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Cookie, Leaf, PackageCheck, Sparkles } from "lucide-react";

import { useAuth } from "@/components/auth-provider";

const promises = [
  { icon: Cookie, title: "Baked with care", copy: "Everyday favorites made for sharing." },
  { icon: Leaf, title: "Pantry, thoughtfully", copy: "The little essentials your kitchen loves." },
  { icon: PackageCheck, title: "A simpler shop", copy: "Your local bakery and pantry, together." },
];

export function Storefront() {
  const { user, loading } = useAuth();

  return (
    <main className="storefront">
      <div className="announcement">
        A little something good is on its way <Sparkles size={14} aria-hidden="true" />
      </div>
      <header className="store-header">
        <Link className="brand" href="/" aria-label="Daybreak Market home">
          <span className="brand-mark">d</span>
          <span>daybreak<span className="brand-light"> market</span></span>
        </Link>
        <nav className="store-nav" aria-label="Main navigation">
          <a href="#our-story">Our story</a>
          <a href="#coming-soon">What we&apos;re making</a>
          {!loading && user ? (
            <Link className="nav-cta" href="/admin">My account <ArrowUpRight size={15} /></Link>
          ) : (
            <Link className="nav-cta" href="/login">Sign in <ArrowUpRight size={15} /></Link>
          )}
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> GOOD THINGS, FRESH DAILY</span>
          <h1>A brighter kind<br />of <em>everyday.</em></h1>
          <p className="hero-description">
            Your neighborhood bakery and pantry, coming together for the little moments that make a day.
          </p>
          <div className="hero-actions">
            <a className="button button-dark" href="#coming-soon">A first look <ArrowDown size={16} /></a>
            <Link className="text-link" href="/login">Already a member? <span>Sign in</span></Link>
          </div>
          <div className="hero-note">
            <div className="avatar-stack" aria-hidden="true"><i>J</i><i>M</i><i>A</i></div>
            <span>Made for your kind of morning</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Illustration of a fresh loaf and a cup of coffee">
          <div className="sun-disc" />
          <div className="art-label art-label-top">FRESH<br />EVERY DAY</div>
          <div className="bread-board" />
          <div className="loaf"><span /><span /><span /></div>
          <div className="croissant croissant-one" />
          <div className="coffee-cup"><div className="coffee" /><div className="cup-handle" /></div>
          <div className="art-sprig sprig-one">✳</div>
          <div className="art-sprig sprig-two">✳</div>
          <div className="art-sticker"><span>made with</span><strong>♥</strong><span>in the neighborhood</span></div>
          <div className="art-label art-label-bottom">BAKE A<br />GOOD DAY</div>
        </div>
      </section>

      <section className="promise-row" id="our-story">
        {promises.map(({ icon: Icon, title, copy }, index) => (
          <article className="promise-card" key={title}>
            <div className="promise-icon"><Icon size={20} strokeWidth={1.7} /></div>
            <div><span className="promise-number">0{index + 1}</span><h2>{title}</h2><p>{copy}</p></div>
          </article>
        ))}
      </section>

      <section className="coming-section" id="coming-soon">
        <div className="coming-copy">
          <span className="eyebrow">THE SHOP IS IN THE OVEN</span>
          <h2>Our shelves are<br />getting ready.</h2>
          <p>
            We&apos;re putting the finishing touches on our online catalog. Create an account now and be ready
            when the first fresh batch lands.
          </p>
          <Link className="button button-outline" href="/login?mode=register">Join the neighborhood <ArrowRight size={16} /></Link>
        </div>
        <div className="coming-card">
          <div className="coming-card-top"><span>DAYBREAK NOTES</span><span>01 / 03</span></div>
          <div className="coming-sun"><span>✳</span></div>
          <p className="coming-script">Something lovely<br />is baking.</p>
          <div className="coming-card-bottom"><span>FRESH STARTS HERE</span><span>EST. WITH LOVE</span></div>
        </div>
      </section>

      <footer className="store-footer">
        <Link className="brand" href="/"><span className="brand-mark">d</span><span>daybreak<span className="brand-light"> market</span></span></Link>
        <span>A good day starts with good things.</span>
        <Link href="/admin" className="footer-admin">Team portal <ArrowUpRight size={13} /></Link>
      </footer>
    </main>
  );
}
