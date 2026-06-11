// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MetaflowMacCompanion",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "metaflow-mac", targets: ["MetaflowMacCompanion"])
    ],
    targets: [
        .executableTarget(
            name: "MetaflowMacCompanion",
            path: "Sources/MetaflowMacCompanion"
        )
    ]
)
