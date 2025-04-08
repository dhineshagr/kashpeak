pipeline {
    agent any

    environment {
        IMAGE_NAME = "dhineshagr/kashpeak"
        IMAGE_TAG = "build-${BUILD_NUMBER}"
        DOCKER_IMAGE = "${IMAGE_NAME}:${IMAGE_TAG}"
        LATEST_TAG = "${IMAGE_NAME}:latest"
        REMOTE_HOST = "172.174.98.154"
        SSH_CRED_ID = "azure-ssh-key"
        CONTAINER_NAME = "kashpeak"
        APP_PORT = "5000"          // backend port inside container
        EXPOSED_PORT = "5000"      // port exposed to VM
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

// stage('Run Tests') {
//     steps {
//         bat 'npm test'
//     }
// }

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
                withCredentials([sshUserPrivateKey(credentialsId: 'azure-ssh-key', keyFileVariable: 'SSH_KEY')]) {
                    bat """
                        plink -batch -i "%SSH_KEY%" -hostkey "ssh-ed25519 255 SHA256:rD9ddrzyxYVBqKH+JItonJ6M+9sEMqgtJUg+PEGJxg0" azureuser@${REMOTE_HOST} ^
                        "docker rm -f ${CONTAINER_NAME} || true && ^
                         docker pull ${LATEST_TAG} && ^
                         docker run -d -p ${EXPOSED_PORT}:${APP_PORT} --name ${CONTAINER_NAME} ${LATEST_TAG}"
                    """
                }
            }
        }
    }

    post {
        success {
            echo "✅ Backend deployed: ${DOCKER_IMAGE}"
        }
        always {
            echo '📦 Pipeline finished!'
        }
    }
}
