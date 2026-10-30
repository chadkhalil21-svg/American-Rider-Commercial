#!/usr/bin/env python3
"""Verify Apple/Google button corner geometry from a real device screenshot.

Install Pillow separately. This is NOT a simulator/source-only substitute.
Usage: python scripts/check-auth-sso-shapes.py device.png --apple 1920:2080 --google 2090:2250
The intervals are rough pixel Y ranges; adjust to each device screenshot.
"""
import argparse
from PIL import Image


def y_window(s):
    a, b = map(int, s.split(':'))
    if a >= b:
        raise argparse.ArgumentTypeError('window must be START:END')
    return a, b


def geometry(img, window, bg, threshold):
    w, _ = img.size
    left, right, cx = int(w * .03), int(w * .30), w // 2

    def detected(x, y):
        p = img.getpixel((x, y))[:3]
        return max(abs(p[i] - bg[i]) for i in range(3)) >= threshold

    ys = [y for y in range(*window) if detected(cx, y)]
    if not ys:
        raise ValueError('No visible sign-in control in ' + repr(window))
    top, bottom = ys[0], ys[-1]

    def edge(y):
        for x in range(left, right):
            if detected(x, y):
                return x
        raise ValueError('Cannot locate button edge at pixel Y=' + str(y))

    midleft = edge((top + bottom) // 2)
    radius_px = edge(top) - midleft
    height_px = bottom - top + 1
    return {'top': top, 'bottom': bottom, 'height': height_px,
            'left': midleft, 'corner': radius_px,
            'corner_to_height': round(radius_px / height_px, 3)}


def label_height(img, button):
    """Measure rendered glyph height, excluding logo, border and button corners."""
    w, _ = img.size
    mid = (button['top'] + button['bottom']) // 2
    # An interior pixel well left of centered text establishes the native fill.
    bg = img.getpixel((int(w * .22), mid))[:3]
    first_x, last_x = int(w * .44), int(w * .84)
    start = button['top'] + int(button['height'] * .19)
    stop = button['bottom'] - int(button['height'] * .19)
    rows = []
    for y in range(start, stop + 1):
        ink = 0
        for x in range(first_x, last_x):
            p = img.getpixel((x, y))[:3]
            if max(abs(int(p[k]) - int(bg[k])) for k in range(3)) >= 85:
                ink += 1
        if 3 <= ink <= (last_x - first_x) * .65:
            rows.append(y)
    if not rows:
        raise ValueError('No provider title text pixels found; inspect screenshot crop')
    return max(rows) - min(rows) + 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('png')
    parser.add_argument('--apple', type=y_window, required=True)
    parser.add_argument('--google', type=y_window, required=True)
    parser.add_argument('--max-corner-fraction-difference', type=float, default=.08)
    parser.add_argument('--max-corner-fraction', type=float, default=.42,
                        help='Both controls must be rectangular, not pill-shaped')
    args = parser.parse_args()
    img = Image.open(args.png).convert('RGB')
    bg = img.getpixel((int(img.width * .04), (args.apple[1] + args.google[0]) // 2))
    apple = geometry(img, args.apple, bg, 20)
    google = geometry(img, args.google, bg, 5)
    gap = abs(apple['corner_to_height'] - google['corner_to_height'])
    print('Apple:', apple, 'Google:', google, 'normalized corner gap:', round(gap, 3))
    apple_text_px = label_height(img, apple)
    google_text_px = label_height(img, google)
    print('Rendered title glyph heights: Apple', apple_text_px, 'px; Google', google_text_px, 'px')
    if abs(apple_text_px - google_text_px) > 3:
        raise SystemExit('FAIL: Apple and Google have visibly different rendered title sizes')
    if abs(apple['height'] - google['height']) / max(apple['height'], google['height']) > .10:
        raise SystemExit('FAIL: Apple and Google have different visible button heights')
    if gap > args.max_corner_fraction_difference:
        raise SystemExit('FAIL: Apple and Google have different rendered corner shapes')
    if max(apple['corner_to_height'], google['corner_to_height']) > args.max_corner_fraction:
        raise SystemExit('FAIL: the Founder selected rectangular, not capsule buttons')
    print('PASS: screenshot has equivalent rounded-rectangular Apple/Google shapes')


if __name__ == '__main__':
    main()
