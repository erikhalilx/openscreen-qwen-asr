// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "LocalTranscription",
    platforms: [.macOS(.v15)],
    dependencies: [
        .package(
            url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.18.3",
            traits: ["Diarizer"]
        ),
    ],
    targets: [
        .executableTarget(
            name: "LocalDiarizer",
            dependencies: [.product(name: "FluidAudio", package: "FluidAudio")]
        ),
    ]
)
