fn main() {
    let target = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    if target == "macos" {
        cc::Build::new()
            .file("native/macos.m")
            .flag("-fobjc-arc")
            .compile("veraflow_native");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
    } else if target == "windows" {
        cc::Build::new()
            .cpp(true)
            .file("native/windows.cpp")
            .compile("veraflow_native");
        println!("cargo:rustc-link-lib=user32");
        println!("cargo:rustc-link-lib=kernel32");
    } else {
        panic!("VeraFlow supports macOS and Windows");
    }
    println!("cargo:rerun-if-changed=native");
    tauri_build::build()
}
