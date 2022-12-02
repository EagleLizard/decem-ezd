package txt

import (
	"fmt"
	"io/ioutil"
	"path/filepath"
	"runtime"
)

// var (
// 	txtDataDir string
// )

func init() {

}

func GetDataDir() string {
	var txtDataDir string
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		panic("unable to get the current filename")
	}
	dirname := filepath.Dir(filename)
	txtDataDir, err := filepath.Abs(filepath.Join(dirname, "../../data/txt"))
	if err != nil {
		panic(err)
	}
	return txtDataDir
}

func ListDirFiles(dirPath string) {
	files, err := ioutil.ReadDir(dirPath)
	if err != nil {
		panic(err)
	}
	for _, fileInfo := range files {
		fmt.Println(fileInfo.Name())
	}
}
