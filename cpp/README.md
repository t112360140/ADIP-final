```shell

git clone https://github.com/opencv/opencv.git
cd opencv/
docker run --rm -v $(pwd):/src -u $(id -u):$(id -g) emscripten/emsdk emcmake python3 ./platforms/js/build_js.py build_js --cmake_option="-DCMAKE_CXX_STANDARD=17"

```

將檔案`InpaintJS.cpp`放到路徑`opencv/modules/js/src`
將檔案`CMakeLists.txt`替換掉`opencv/modules/js/CMakeLists.txt`