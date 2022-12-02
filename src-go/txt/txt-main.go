package txt

import (
	"fmt"
)

func init() {

}

func TxtMain() {
	var dataDirPath string
	fmt.Println("etc")
	dataDirPath = GetDataDir()
	fmt.Println(dataDirPath)
	ListDirFiles(dataDirPath)
}
