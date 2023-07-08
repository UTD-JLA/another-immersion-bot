package main

import (
	"bufio"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"
	"text/template"
)

func getConfirmation(message string) bool {
	reader := bufio.NewReader(os.Stdin)
	fmt.Printf("%s (y/n): ", message)
	text, _ := reader.ReadString('\n')
	text = strings.TrimSuffix(strings.ToLower(text), "\n")

	for text != "y" && text != "n" {
		fmt.Print("Please enter Y[y] or N[n]: ")
		text, _ = reader.ReadString('\n')
		text = strings.TrimSuffix(strings.ToLower(text), "\n")
	}

	return text == "y"
}

type outputFileContext struct {
	Language string
	Type     string
	Source   string
}

func getOutputFileName(ctx outputFileContext) string {
	tmpl, err := template.New("output").Parse(*OutputFileFormat)

	if err != nil {
		panic(err)
	}

	var output strings.Builder
	err = tmpl.Execute(&output, ctx)

	if err != nil {
		panic(err)
	}

	return output.String()
}

var SkipConfirmation = flag.Bool("y", false, "Skip confirmation")
var OutputDir = flag.String("o", "data", "Output directory")
var OutputFileFormat = flag.String("f", "{{.Language}}.{{.Type}}.{{.Source}}.txt", "Output file format using Go template syntax")

func main() {
	flag.Parse()

	// make sure output directory exists
	err := os.MkdirAll(*OutputDir, 0755)

	if err != nil {
		panic(err)
	}

	aodb, err := DownloadAnimeOfflineDb()

	if err != nil {
		panic(err)
	}

	fmt.Println("Last updated: " + aodb.LastUpdated)
	aodb.PrintLicense()

	if !*SkipConfirmation && !getConfirmation("Do you want to write the titles to a file?") {
		return
	}

	aodbPath := fmt.Sprintf("%s/%s", *OutputDir, getOutputFileName(outputFileContext{
		Language: "en",
		Type:     "anime",
		Source:   "aodb",
	}))

	err = aodb.WriteTitleFile(aodbPath)
	fmt.Println("Wrote titles to " + aodbPath)

	if err != nil {
		panic(err)
	}

	vndb, err := DownloadVNDB(func(req *http.Request, via []*http.Request) error {
		msg := "Redirecting to version: " + req.URL.String()

		fmt.Println("License info: https://vndb.org/d17#4")

		if !*SkipConfirmation && !getConfirmation(msg) {
			return fmt.Errorf("user aborted")
		}

		return nil
	})

	if err != nil {
		panic(err)
	}

	vndbPath := fmt.Sprintf("%s/%s", *OutputDir, getOutputFileName(outputFileContext{
		Language: "en",
		Type:     "vn",
		Source:   "vndb",
	}))

	err = vndb.WriteTitleFile(vndbPath)

	if err != nil {
		panic(err)
	}

	fmt.Println("Wrote titles to " + vndbPath)
}
