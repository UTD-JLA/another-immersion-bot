import bisect
import sys

# Works with data from VNDB dump
# Outputs to vn_ja_titles.txt and vn_en_titles.txt in the current directory
# Usage: python vn-extractor.py <vndb-data-dir>
# Example: python vn-extractor.py ./vndb-db-2023-06-17/db

_CONTROL_CHAR = chr(0x0009)

def extract_vn(vndb_dir):
    ja_titles = []
    en_titles = []
    fields = ['id', 'lang', 'official', 'title', 'latin']
    with open(vndb_dir + '/vn_titles', 'r', encoding='utf-8') as f:
        for line in f:
            line = line.split(_CONTROL_CHAR)
            if len(line) != len(fields):
                continue
            entry = dict(zip(fields, line))
            if entry['lang'] == 'ja':
                bisect.insort(ja_titles, entry['title'])
            elif entry['lang'] == 'en':
                bisect.insort(en_titles, entry['title'])
    return ja_titles, en_titles
  
def main():
    if len(sys.argv) != 2:
        print('Usage: python vn-extractor.py <vndb-data-dir>')
        return
    ja_titles, en_titles = extract_vn(sys.argv[1])
    with open('vn_ja_titles.txt', 'w', encoding='utf-8') as f:
        for title in ja_titles:
            f.write(title + '\n')
    with open('vn_en_titles.txt', 'w', encoding='utf-8') as f:
        for title in en_titles:
            f.write(title + '\n')

if __name__ == '__main__':
    main()
