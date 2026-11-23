// This Jenkinsfile is used by Jenkins to run the 'SBGNExporter' step of Reactome's release: the
// release's bulk SBGN file, homo_sapiens.sbgn.tar.gz (README, "The release's bulk file"), in
// place of the SBGN run of the 'DiagramExporter' step. It requires that the 'DiagramConverter'
// step has been run successfully before it can be run.

import org.reactome.release.jenkins.utilities.Utilities

// Shared library maintained at 'release-jenkins-utils' repository.
def utils = new Utilities()
pipeline{
	agent any

	environment {
		OUTPUT_FOLDER = "sbgn"
		ARCHIVE = "homo_sapiens.sbgn.tar.gz"
		// The 'DiagramConverter' step's output folder, which it moves into the release's
		// download folder: the layouts the documents are drawn from.
		DIAGRAM_FOLDER = "diagram"
		ECR_URL = 'public.ecr.aws/reactome/sbgn-exporter'
		CONT_NAME = 'sbgn_exporter_container'
	}

	stages{
		// This stage checks that upstream project 'DiagramConverter' was run successfully.
		stage('Check DiagramConverter build succeeded'){
			steps{
				script{
					utils.checkUpstreamBuildsSucceeded("File-Generation/job/DiagramConverter/")
				}
			}
		}

		stage('Setup: Pull and clean docker environment'){
			steps{
				sh "docker pull ${ECR_URL}:latest"
				sh """
					if docker ps -a --format '{{.Names}}' | grep -Eq '${CONT_NAME}'; then
						docker rm -f ${CONT_NAME}
					fi
				"""
			}
		}

		// The bulk file, from the release's graph (its pathways with a diagram) and its diagram
		// files. Exit 1 if any pathway could not be written (the archive holds the rest, and the
		// log names each one with its reason); exit 2 if the graph cannot be read.
		stage('Main: Run SBGN-Exporter'){
			steps{
				script{
					def releaseVersion = utils.getReleaseVersion()
					def diagramPath = "${env.ABS_DOWNLOAD_PATH}/${releaseVersion}/${env.DIAGRAM_FOLDER}"
					sh """
						if ! find '${diagramPath}/' -maxdepth 1 -name 'R-*.json' -print -quit | grep -q .; then
							echo "No diagram files at the top of ${diagramPath}"
							exit 1
						fi
					"""
					sh "mkdir -p ${env.OUTPUT_FOLDER}"
					sh "rm -rf ${env.OUTPUT_FOLDER}/*"
					withCredentials([ usernamePassword(credentialsId: 'neo4jUsernamePassword', passwordVariable: 'neo4jPass', usernameVariable: 'neo4jUser') ])
					{
						sh """\
							docker run \\
							-v \$(pwd)/${env.OUTPUT_FOLDER}:/out \\
							-v ${diagramPath}:/diagrams:ro \\
							-e NEO4J_URI=bolt://localhost:7687 \\
							-e NEO4J_USER=\$neo4jUser \\
							-e NEO4J_PASSWORD=\$neo4jPass \\
							-u \$(id -u):\$(id -g) \\
							--net=host \\
							--name ${CONT_NAME} \\
							${ECR_URL}:latest \\
							bulk --diagrams /diagrams --out /out/${env.ARCHIVE} > sbgn-exporter.log 2>&1; \\
							status=\$?; cat sbgn-exporter.log; exit \$status
						"""
					}
				}
			}
		}

		// The archive is there and holds documents: as many as the previous release's, less 10%,
		// as the release's verifiers allow for a file's size.
		stage('Post: Verify SBGN-Exporter ran correctly'){
			steps{
				script{
					def releaseVersion = utils.getReleaseVersion()
					def previousReleaseVersion = utils.getPreviousReleaseVersion()
					def previous = "${env.ABS_DOWNLOAD_PATH}/${previousReleaseVersion}/${env.ARCHIVE}"
					sh """
						count=\$(tar -tzf ${env.OUTPUT_FOLDER}/${env.ARCHIVE} | grep -c '\\.sbgn\$')
						echo "\$count documents in release ${releaseVersion}'s ${env.ARCHIVE}"
						[ "\$count" -gt 0 ]
						if [ -f '${previous}' ]; then
							before=\$(tar -tzf '${previous}' | grep -c '\\.sbgn\$')
							echo "\$before in release ${previousReleaseVersion}'s"
							[ \$(( count * 100 )) -ge \$(( before * 90 )) ]
						fi
					"""
				}
			}
		}

		stage('Post: Move the bulk file to the downloads folder'){
			steps{
				script{
					def releaseVersion = utils.getReleaseVersion()
					sh "cp ${env.OUTPUT_FOLDER}/${env.ARCHIVE} ${env.ABS_DOWNLOAD_PATH}/${releaseVersion}/"
					sh "mv ${env.OUTPUT_FOLDER}/${env.ARCHIVE} ."
				}
			}
		}

		// Archive the bulk file and the log on S3.
		stage('Post: Archive Outputs'){
			steps{
				script{
					def dataFiles = ["${env.ARCHIVE}"]
					def logFiles = ["sbgn-exporter.log"]
					def foldersToDelete = ["${env.OUTPUT_FOLDER}"]
					utils.cleanUpAndArchiveBuildFiles("sbgn_exporter", dataFiles, logFiles, foldersToDelete)
				}
			}
		}
	}
}
