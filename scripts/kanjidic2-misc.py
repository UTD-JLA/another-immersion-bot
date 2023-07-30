import json
import sys

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: kanjidic2-misc.py <kanjidic2.json>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        kanjidic2 = json.load(f)

    kanji_misc = {}

    for kanji in kanjidic2['characters']:
        misc = kanji['misc']
        del misc['variants']
        if misc:
            kanji_misc[kanji['literal']] = misc

    with open("kanjidic2-misc.json", "w") as f:
        json.dump(kanji_misc, f, indent=2, ensure_ascii=False)
