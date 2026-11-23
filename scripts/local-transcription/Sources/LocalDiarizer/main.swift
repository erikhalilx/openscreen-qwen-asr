import FluidAudio
import Foundation

struct SpeakerTurn: Encodable {
    let speakerId: String
    let startSec: Double
    let endSec: Double
}

@main
struct LocalDiarizer {
    static func main() async {
        do {
            let arguments = Array(CommandLine.arguments.dropFirst())
            AppLogger.mirrorsToConsole = false
            var config = OfflineDiarizerConfig()
            if arguments.count == 2 {
                guard let count = Int(arguments[1]), count > 0 else {
                    throw CocoaError(.fileReadCorruptFile)
                }
                config = config.withSpeakers(exactly: count)
            }
            let manager = OfflineDiarizerManager(config: config)
            if arguments == ["--prepare"] {
                try await manager.prepareModels()
                return
            }
            guard (1...2).contains(arguments.count), let path = arguments.first else {
                throw CocoaError(.fileReadInvalidFileName)
            }
            let result = try await manager.process(URL(fileURLWithPath: path))
            let turns = result.segments.map {
                SpeakerTurn(
                    speakerId: $0.speakerId,
                    startSec: Double($0.startTimeSeconds),
                    endSec: Double($0.endTimeSeconds)
                )
            }
            let data = try JSONEncoder().encode(turns)
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data([10]))
        } catch OfflineDiarizationError.noSpeechDetected {
            FileHandle.standardOutput.write(Data("[]\n".utf8))
        } catch {
            FileHandle.standardError.write(Data("\(error)\n".utf8))
            exit(1)
        }
    }
}
