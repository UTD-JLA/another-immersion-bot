package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
	_ "modernc.org/sqlite"
)

type SqliteEntry struct {
	UserId    int
	Amount    float64
	Note      *string
	MediaType string
	CreatedAt time.Time
}

type MongoDbEntry struct {
	UserId   string    `bson:"userId"`
	Name     string    `bson:"name"`
	Duration float64   `bson:"duration"`
	Type     string    `bson:"type"`
	Date     time.Time `bson:"date"`
	Url      *string   `bson:"url,omitempty"`
	Tags     *[]string `bson:"tags,omitempty"`
}

type BasicYoutubeInfo struct {
	Title string `json:"title"`
}

func mapPointsToMinutes(mediaType string, points float64) (float64, error) {
	switch mediaType {
	case "READING":
		fallthrough
	case "VN":
		return points / 350, nil
	case "MANGA":
		return points / 3, nil
	case "ANIME":
		return points * 24, nil
	case "BOOK":
		return points, nil
	// these do not log the actual times, but instead do time * 0.45, we should undo this
	case "READTIME":
		fallthrough
	case "LISTENING":
		return points, nil
	default:
		return 0, fmt.Errorf("unknown media type: %s", mediaType)
	}
}

func mapMediaTypeToMajorType(mediaType string) (string, error) {
	switch mediaType {
	case "READTIME":
		fallthrough
	case "VN":
		fallthrough
	case "READING":
		fallthrough
	case "MANGA":
		fallthrough
	case "BOOK":
		return "reading", nil
	case "ANIME":
		fallthrough
	case "LISTENING":
		return "listening", nil
	default:
		return "", fmt.Errorf("unknown media type: %s", mediaType)
	}
}

func isUrl(potentialUrl string) bool {
	return len(potentialUrl) > 4 && potentialUrl[0:4] == "http"
}

func isYoutubeUrl(potentialUrl string) bool {
	url, err := url.Parse(potentialUrl)

	return isUrl(potentialUrl) && err == nil && url != nil && (url.Host == "youtu.be" || url.Host == "youtube.com")
}

func getTagsFromNoteOrMediaType(note, mediaType string) *[]string {
	tags := make([]string, 0)

	if isYoutubeUrl(note) {
		tags = append(tags, "youtube")
	}

	if mediaType == "VN" {
		tags = append(tags, "vn")
	} else if mediaType == "MANGA" {
		tags = append(tags, "manga")
	} else if mediaType == "BOOK" {
		tags = append(tags, "book")
	} else if mediaType == "ANIME" {
		tags = append(tags, "anime")
	}

	return &tags
}

func mapPotentialUrlToUrl(potentialUrl string) *string {
	if isUrl(potentialUrl) {
		return &potentialUrl
	}

	return nil
}

func getBasicYoutubeInfo(url string) *BasicYoutubeInfo {
	cmd := exec.Command("yt-dlp", "--get-title", url)
	out, err := cmd.Output()

	if err != nil {
		fmt.Println("Error getting title for url: ", url)
		fmt.Println(err)
		return nil
	}

	title := string(out)

	return &BasicYoutubeInfo{title}
}

func readAndMapSqliteEntries(db *sql.DB, allowedGuildId int) []*MongoDbEntry {
	rows, err := db.Query("SELECT discord_user_id, amount, note, media_type, created_at, discord_guild_id FROM logs")
	entries := make([]*MongoDbEntry, 0)

	if err != nil {
		log.Fatal("Error querying sqlite database: ", err)
	}

	defer rows.Close()

	for rows.Next() {
		var entry SqliteEntry
		var guildId int

		err = rows.Scan(&entry.UserId, &entry.Amount, &entry.Note, &entry.MediaType, &entry.CreatedAt, &guildId)

		if err != nil {
			log.Fatal("Error scanning sqlite rows: ", err)
		}

		if guildId != allowedGuildId {
			// print info in blue
			fmt.Println("\033[34mSkipping entry for guild id: ", guildId, "\033[0m")
			continue
		}

		newEntry, err := mapSqliteEntryToMongoDbEntry(entry)

		if err != nil {
			// print this in red
			fmt.Println("\033[31mError mapping sqlite entry to mongodb entry: ", err, "\033[0m")
		} else {
			fmt.Println("Mapped entry: ", newEntry)

			entries = append(entries, newEntry)
		}
	}

	return entries
}

func mapSqliteEntryToMongoDbEntry(sqliteEntry SqliteEntry) (*MongoDbEntry, error) {
	var mongoEntry MongoDbEntry
	var note string

	if sqliteEntry.Note != nil {
		note = *sqliteEntry.Note
	} else {
		note = ""
	}

	mongoEntry.UserId = strconv.Itoa(sqliteEntry.UserId)
	if len(note) > 0 {
		mongoEntry.Name = *sqliteEntry.Note
	} else {
		mongoEntry.Name = sqliteEntry.MediaType
	}

	duration, err := mapPointsToMinutes(sqliteEntry.MediaType, sqliteEntry.Amount)

	if err != nil {
		return nil, err
	}

	if mongoEntry.Duration > 300 {
		fmt.Printf("Duration is greater than 300 minutes: %s %f\n", sqliteEntry.MediaType, sqliteEntry.Amount)
	}

	entryType, err := mapMediaTypeToMajorType(sqliteEntry.MediaType)

	if err != nil {
		return nil, err
	}

	mongoEntry.Duration = duration
	mongoEntry.Type = entryType
	mongoEntry.Url = mapPotentialUrlToUrl(note)
	mongoEntry.Date = sqliteEntry.CreatedAt
	mongoEntry.Tags = getTagsFromNoteOrMediaType(note, sqliteEntry.MediaType)

	if mongoEntry.Url != nil && isYoutubeUrl(*mongoEntry.Url) {
		basicYoutubeInfo := getBasicYoutubeInfo(*mongoEntry.Url)
		if basicYoutubeInfo != nil {
			// print success in green
			fmt.Println("\033[32mSuccessfully got basic youtube info for url: ", *mongoEntry.Url, "\033[0m")
			mongoEntry.Name = basicYoutubeInfo.Title
		} else {
			/// log warning in yellow
			fmt.Println("\033[33mError getting basic youtube info for url: ", *mongoEntry.Url, "\033[0m")
		}
	}

	return &mongoEntry, nil
}

// flag for sqlite file
var sqliteFile = flag.String("sqlite", "", "sqlite file to read from")

// flag for mongodb connection string
var mongoConn = flag.String("mongo", "mongodb://127.0.0.1:27017", "mongodb connection string")

// discord id to search for
var discordId = flag.Int("discord", 0, "discord id to search for")

// var json file
var jsonFile = flag.String("json", "", "json file to read from (if sqlite is not specified) or to write to (if sqlite is specified)")

// mongo database name
var mongoDbName = flag.String("db", "test", "mongodb database name")

func main() {
	flag.Parse()

	var entries []*MongoDbEntry

	if *sqliteFile != "" {
		fmt.Println("Using sqlite file: ", *sqliteFile)
		// connect to sqlite file
		db, err := sql.Open("sqlite", *sqliteFile)

		if err != nil {
			log.Fatal("Error opening sqlite file: ", err)
		}

		defer db.Close()

		err = db.Ping()

		if err != nil {
			log.Fatal("Error creating connection to sqlite database: ", err)
		}

		fmt.Println("Reading entries from sqlite file...")
		entries = readAndMapSqliteEntries(db, *discordId)

		for _, entry := range entries {
			fmt.Printf("%+v\n", entry)
		}

		if *jsonFile != "" {
			fmt.Println("Writing entries to json file: ", *jsonFile)
			file, err := os.Create(*jsonFile)

			if err != nil {
				log.Fatal("Error creating json file: ", err)
			}

			defer file.Close()

			err = json.NewEncoder(file).Encode(entries)

			if err != nil {
				log.Fatal("Error encoding entries to json file: ", err)
			}

			return
		}
	}

	if *jsonFile != "" {
		fmt.Println("Reading entries from json file: ", *jsonFile)
		file, err := os.Open(*jsonFile)

		if err != nil {
			log.Fatal("Error opening json file: ", err)
		}

		defer file.Close()

		err = json.NewDecoder(file).Decode(&entries)

		if err != nil {
			log.Fatal("Error decoding entries from json file: ", err)
		}
	}

	if len(entries) == 0 {
		fmt.Println("No entries to insert into mongodb")
		return
	}

	// connect to mongodb
	fmt.Println("Connecting to mongodb...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(*mongoConn))

	if err != nil {
		log.Fatal("Error connecting to mongodb: ", err)
	}

	err = client.Ping(ctx, readpref.Primary())

	if err != nil {
		log.Fatal("Error pinging mongodb: ", err)
	}

	fmt.Println("Inserting entries into mongodb...")

	collection := client.Database(*mongoDbName).Collection("activities")

	for _, entry := range entries {
		fmt.Println("Inserting entry: ", entry)
		_, err := collection.InsertOne(ctx, entry)
		if err != nil {
			log.Fatal("Error inserting entry into mongodb: ", err)
		}
	}

	fmt.Println("Done!")
}
