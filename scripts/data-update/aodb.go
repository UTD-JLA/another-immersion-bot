package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/schollz/progressbar/v3"
)

var AODFile = "https://raw.githubusercontent.com/manami-project/anime-offline-database/master/anime-offline-database-minified.json"
var DataFile = "anime-offline-database-minified.json"

type AODB struct {
	License     AODBLicense `json:"license"`
	LastUpdated string      `json:"lastUpdate"`
	Data        []AODBAnime `json:"data"`
}

type AODBLicense struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type AODBAnime struct {
	Title string `json:"title"`
	// ...
}

func DownloadAnimeOfflineDb() (*AODB, error) {
	content := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := content.Get(AODFile)

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	bar := progressbar.DefaultBytes(
		resp.ContentLength,
		"Downloading Anime Offline Database",
	)

	aodb := &AODB{}

	reader := io.TeeReader(resp.Body, bar)
	err = json.NewDecoder(reader).Decode(aodb)

	if err != nil {
		return nil, err
	}

	bar.Finish()

	return aodb, nil
}

func (db *AODB) PrintLicense() {
	fmt.Printf("License: %s\n", db.License.Name)
	fmt.Printf("License URL: %s\n", db.License.URL)
}

func (db *AODB) WriteTitleFile(path string) error {
	file, err := os.Create(path)

	if err != nil {
		return err
	}

	defer file.Close()

	for _, anime := range db.Data {
		file.WriteString(anime.Title + "\n")
	}

	return nil
}
