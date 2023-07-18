import bisect
import sys

# Works with data from VNDB dump
# Outputs to ja.anime.anidb.txt
# Usage: python anidb-extractor.py anime-titles.dat

_CONTROL_CHAR = '|'

# Types: 1 (primary), 2 (synonym), 3 (short), 4 (official)
# We want to use all x-jat and type 3 ja titles as aliases
# and ja type 4 as the primary title

def extract_anime(titles_file):
    # <aid>|<type>|<language>|<title>

    # dict of titles by aid (first title is primary)
    anime = {}
    fields = ['aid', 'type', 'lang', 'title']
    with open(titles_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            line = line.split(_CONTROL_CHAR)
            if len(line) != len(fields):
                continue
            entry = dict(zip(fields, line))

            titles = anime.get(entry['aid'], [])

            if entry['lang'] == 'x-jat' or (entry['type'] == '3' and entry['lang'] == 'ja'):
                titles.append(entry['title'])
            elif entry['type'] == '4' and entry['lang'] == 'ja':
                titles.insert(0, entry['title'])
    
            anime[entry['aid']] = titles

    # return a list of lists of titles
    return anime.values()
  
def main():
    if len(sys.argv) != 2:
        print('Usage: python anidb-extractor.py <anime-titles-file>')
        return
    title_groups = extract_anime(sys.argv[1])
    with open('ja.anime.anidb.txt', 'w', encoding='utf-8') as f:
        for titles in title_groups:
            if len(titles) == 0:
                continue

            for title in titles:
                f.write(title + '\n')
            f.write('\n')

if __name__ == '__main__':
    main()
