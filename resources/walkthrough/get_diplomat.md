# Getting Diplomat server

Before working with Diplomat, it is mandatory to get a working version of the language server executable.
This executable and the instructions to build it may be found on [GitHub](https://github.com/suzizecat/slang-lsp-tools).

It requires : 
 - A modern GCC version (supporting C++20),
 - A recent version of CMake (3.15+)
 - Python 3

 And the required commands on Ubuntu systems are:
 ```commands
 git clone git@github.com:suzizecat/slang-lsp-tools.git
cd slang-lsp-tools
cmake -DCMAKE_BUILD_TYPE=Release -B./build
cmake --build ./build --target slang-lsp -j `nproc`
```

A pre-built version (for Ubuntu) is available on the [release page](https://github.com/suzizecat/slang-lsp-tools/releases/latest)