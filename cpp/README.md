```shell

git clone https://github.com/opencv/opencv.git

cd opencv/

docker run --rm -v $(pwd):/src -u $(id -u):$(id -g) emscripten/emsdk emcmake python3 ./platforms/js/build_js.py build_js --config="./platforms/js/opencv_js.config.py" --cmake_option="-DCMAKE_CXX_STANDARD=17" --build_flags="-O3 -flto -s ENVIRONMENT=web" --build_wasm --cmake_option="-DBUILD_opencv_dnn=OFF"

```

將檔案`InpaintJS/InpaintJS_V1.cpp`放到路徑`opencv/modules/js/src`
將檔案`CMakeLists.txt`替換掉`opencv/modules/js/CMakeLists.txt`
將檔案`opencv_js.config.py`替換掉`opencv/modules/js/opencv_js.config.py`
