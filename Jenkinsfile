pipeline {
    agent any

    environment {
        IMAGE_NAME = "dhineshagr/kashpeak"
        IMAGE_TAG = "build-${BUILD_NUMBER}"
        DOCKER_IMAGE = "${IMAGE_NAME}:${IMAGE_TAG}"
        LATEST_TAG = "${IMAGE_NAME}:latest"
        REMOTE_HOST = "20.127.197.227"
        SSH_CRED_ID = "azure-ssh-key"
        CONTAINER_NAME = "kashpeak"
        APP_PORT = "5000"
        EXPOSED_PORT = "5000"
        HOST_KEY = "ssh-ed25519 255 SHA256:EWM3xhcabwaMCY8uo9AapEhwHsBREpvpHA0+0cd+Fjs"

    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main', url: 'https://github.com/dhineshagr/kashpeak.git'
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm install'
            }
        }

        stage('Test') {
            steps {
                // Optional test script, currently just placeholder
                bat 'echo "No tests configured"'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat "docker build -t ${DOCKER_IMAGE} -t ${LATEST_TAG} ."
            }
        }

        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'docker-hub-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    bat """
                        echo %DOCKER_PASS% | docker login -u %DOCKER_USER% --password-stdin
                        docker push ${DOCKER_IMAGE}
                        docker push ${LATEST_TAG}
                    """
                }
            }
        }

        stage('Deploy to Dev Server') {
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: SSH_CRED_ID, keyFileVariable: 'SSH_KEY')]) {
                    bat """
                        set REMOTE_CMD=docker rm -f ${CONTAINER_NAME} || true && docker pull ${LATEST_TAG} && docker run -d -p ${EXPOSED_PORT}:${APP_PORT} --name ${CONTAINER_NAME} ${LATEST_TAG}
                        plink -batch -i "%SSH_KEY%" -hostkey "${HOST_KEY}" azureuser@${REMOTE_HOST} "%REMOTE_CMD%"
                    """
                }
            }
        }
    }

    post {
        success {
            echo "✅ Backend build & deployment successful: ${DOCKER_IMAGE}"
        }
        always {
            echo "📦 Pipeline complete"
        }
    }
}
