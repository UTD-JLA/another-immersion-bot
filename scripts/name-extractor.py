import bisect
import json
import sys

# Works with data from
# https://github.com/manami-project/anime-offline-database

# Example usage: python name-extractor.py data/anime-offline-database.json > data/names.txt

def main():
    if len(sys.argv) != 2:
        print('Usage: python name-extractor.py <input-file> [output-file]')
        return
    
    input_file_name = sys.argv[1]
    if len(sys.argv) == 3:
      output_file = open(sys.argv[2], 'w')
    else:
      output_file = sys.stdout

    names = []

    with open(input_file_name, 'r') as f:
        data = json.load(f)['data']
        for entry in data:
            bisect.insort(names, entry['title'])

    for name in names:
        output_file.write(name + '\n')

    output_file.close()

if __name__ == '__main__':
    main()
