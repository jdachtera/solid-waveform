#!/usr/bin/env python3
"""E2E for the solid-viewport-migrated waveform demo (http://localhost:5175).

Loads a PCM WAV (headless Chromium can't decode the default AAC), then drives the
zoom-pan wheel: scroll-down zooms (anchored), horizontal pans, diagonal does both.
Verifies via the zoom number input, the Position field, and the scrollbar width."""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:5175/"
errors = []
passed, failed = [], []


def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1100, "height": 700})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")

    page.get_by_role("textbox").first.fill("/test_tone.wav")
    page.get_by_role("button", name="Update").click()
    page.wait_for_timeout(2500)  # decode + first draw

    zoom = lambda: float(page.eval_on_selector("input[type=number]", "e => e.value"))
    pos = lambda: float(page.get_by_role("textbox").nth(1).input_value())
    barw = lambda: page.query_selector(".Waveform-ScrollbarDiv").evaluate("e => e.getBoundingClientRect().width")

    canvas = page.query_selector(".Waveform canvas")
    drawn = canvas.evaluate(
        "cv=>{const g=cv.getContext('2d');const d=g.getImageData(0,0,cv.width,cv.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;}")
    check("waveform draws from decoded audio", drawn > 1000, f"{drawn} px")

    box = page.query_selector(".Waveform").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + 150

    # Scroll DOWN = zoom in (anchored). z stays >= 1.
    page.mouse.move(cx, cy)
    z0, w0 = zoom(), barw()
    page.mouse.wheel(0, 240)
    page.wait_for_timeout(150)
    z1, w1 = zoom(), barw()
    check("scroll-down zooms in", z1 > z0 + 0.05, f"zoom {z0:.3f} -> {z1:.3f}")
    check("scrollbar widens with zoom", w1 > w0 + 1, f"barw {w0:.0f} -> {w1:.0f}")

    # Now that we're zoomed in, a horizontal wheel pans (position changes), zoom steady.
    p0, z_before_pan = pos(), zoom()
    page.mouse.wheel(300, 0)
    page.wait_for_timeout(150)
    p1, z_after_pan = pos(), zoom()
    check("horizontal wheel pans when zoomed", p1 > p0, f"pos {p0:.3f} -> {p1:.3f}")
    check("pan keeps zoom", abs(z_after_pan - z_before_pan) < 1e-3, f"zoom {z_before_pan:.3f} -> {z_after_pan:.3f}")

    # Diagonal = zoom AND pan together, no modifier.
    p2, z2 = pos(), zoom()
    page.mouse.wheel(150, 120)
    page.wait_for_timeout(150)
    p3, z3 = pos(), zoom()
    check("diagonal wheel zooms AND pans together", z3 > z2 + 0.02 and p3 != p2,
          f"zoom {z2:.3f}->{z3:.3f}, pos {p2:.3f}->{p3:.3f}")

    # Anchor: zoom in with the cursor near the right edge -> position moves right.
    page.mouse.move(box["x"] + box["width"] - 20, cy)
    p_anchor0 = pos()
    page.mouse.wheel(0, 200)
    page.wait_for_timeout(150)
    p_anchor1 = pos()
    check("zoom anchored on cursor (right edge moves pos right)", p_anchor1 > p_anchor0,
          f"pos {p_anchor0:.3f} -> {p_anchor1:.3f}")

    check("no console/page errors", not errors, f"{errors[:3]}")
    browser.close()

print(f"\n{len(passed)} passed, {len(failed)} failed")
if failed:
    print("FAILED:", ", ".join(failed))
    sys.exit(1)
