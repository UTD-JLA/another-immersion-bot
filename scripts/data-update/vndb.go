package main

import (
	"archive/tar"
	"bufio"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/klauspost/compress/zstd"
	"github.com/schollz/progressbar/v3"
)

var VNDBArchive = "https://dl.vndb.org/dump/vndb-db-latest.tar.zst"
var TargetFile = "db/vn_titles"

type VNDB struct {
	Entries []VNDBEntry
}

type VNDBEntry struct {
	ID       string
	Language string
	Official bool
	Title    string
	Latin    string
}

func DownloadVNDB(checkRedirect func(req *http.Request, via []*http.Request) error) (*VNDB, error) {
	client := &http.Client{
		CheckRedirect: checkRedirect,
	}

	resp, err := client.Get(VNDBArchive)

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	bar := progressbar.DefaultBytes(
		resp.ContentLength,
		"Downloading VNDB",
	)

	reader := io.TeeReader(resp.Body, bar)
	uncompressed, err := zstd.NewReader(reader)

	if err != nil {
		return nil, err
	}

	tarReader := tar.NewReader(uncompressed)

	for {
		hdr, err := tarReader.Next()

		if err != nil {
			return nil, err
		}

		if hdr.Name == TargetFile {
			bar.Describe("Found target file")
			bar.Finish()
			break
		}
	}

	vndb := &VNDB{}
	vndb.Entries = make([]VNDBEntry, 0)

	scanner := bufio.NewScanner(tarReader)

	for scanner.Scan() {
		line := scanner.Text()
		cells := strings.Split(line, "\t")

		if len(cells) != 5 {
			continue
		}

		entry := VNDBEntry{
			ID:       cells[0],
			Language: cells[1],
			Official: cells[2] == "t",
			Title:    cells[3],
			Latin:    cells[4],
		}

		vndb.Entries = append(vndb.Entries, entry)
	}

	return vndb, nil
}

func (db *VNDB) WriteTitleFile(path string) error {
	file, err := os.Create(path)

	if err != nil {
		return err
	}

	defer file.Close()

	for _, vn := range db.Entries {
		if vn.Language != "en" {
			continue
		}

		file.WriteString(vn.Title + "\n")
	}

	return nil
}
