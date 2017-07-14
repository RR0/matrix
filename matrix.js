class Question {
  constructor(t, i) {
    this.title = t;
    this.choices = {};
    this.index = i;
  }
}

class Choice {
  constructor(l, a, knownPhenomenaProbabilities) {
    this.label = l;
    this.answerType = a;
    this.knownPhenomenaProbabilities = knownPhenomenaProbabilities;
    this.value = false;
  }
}

class MatrixService {

  constructor($log, $q, $rootScope, $http) {
    this.$log = $log;
    this.$q = $q;
    this.$rootScope = $rootScope;
    this.$http = $http;
  }

  loadURL(u) {
    return this.$q((resolve, reject) => {
      this.$http({method: "GET", url: u})
        .then(response => {
          this.$log.info("Loaded '" + u + "'");
          resolve(response.data);
        })
        .catch((response, status) => {
          reject("Could not load '" + u + "': " + status);
        });
    });
  }

  loadFile(f) {
    return this.$q((resolve, reject) => {
      const matrixFileReader = new FileReader();
      matrixFileReader.onloadend = e => {
        try {
          const matrixData = JSON.parse(e.target.result);
          resolve(matrixData);
        } catch (err) {
          reject(err);
        }
      };
      matrixFileReader.readAsText(f);
    });
  }

  loadLabels(labelsInput) {
    return typeof labelsInput === "object"
      ? this.loadFile(labelsInput)
      : this.loadURL(labelsInput);
  }

  loadMatrixData(matrixData, labelsInput) {
    this.loadLabels(labelsInput)
      .then(messages => {
          this.msg = messages;
          let i = 0;
          const questions = (this.questions = {});
          for (const d in matrixData) {
            if (matrixData.hasOwnProperty(d)) {
              const item = matrixData[d];
              const dotPos = item.question.indexOf(".");
              const questionKey = item.question.substring(0, dotPos);
              const choiceKey = item.question.substring(dotPos + 1);
              let question = questions[questionKey];
              if (!question) {
                question = new Question(messages[questionKey], i++);
                questions[questionKey] = question;
              }
              question.choices[choiceKey] = new Choice(
                messages[item.question],
                item.answertype,
                item.knownPhenomenaProbabilities
              );
            }
          }
          this.$rootScope.$broadcast("dataLoaded", questions);
        },
        function (reason) {
          this.$log.error(reason);
          this.$rootScope.$broadcast("dataError", reason);
        }
      );
  }

  load(matrixInput, labelsInput) {
    if (typeof matrixInput === "object") {
      this.loadFile(matrixInput)
        .then(matrixData => this.loadMatrixData(matrixData, labelsInput))
        .catch(reason => this.$rootScope.$broadcast("dataError", reason));
    } else {
      this.loadURL(matrixInput)
        .then(matrixData => this.loadMatrixData(matrixData, labelsInput))
        .catch(reason => this.$rootScope.$broadcast("dataError", reason));
    }
  }

  compute(probable) {
    const zerosCount = {};
    let max = 0;
    const questions = this.questions;
    for (const q in questions) {
      if (questions.hasOwnProperty(q)) {
        const question = questions[q];
        for (const c in question.choices) {
          if (question.choices.hasOwnProperty(c)) {
            const choice = question.choices[c];
            if (choice.value !== false) {
              const knownPhenomenaProbabilities = choice.knownPhenomenaProbabilities;
              for (const p in knownPhenomenaProbabilities) {
                if (knownPhenomenaProbabilities.hasOwnProperty(p)) {
                  if (!zerosCount[p]) {
                    zerosCount[p] = 0;
                  }
                  if (knownPhenomenaProbabilities[p] === 0) {
                    zerosCount[p]++;
                    if (zerosCount[p] > max) {
                      max = zerosCount[p];
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    const explanations = [];
    for (const z in zerosCount) {
      if (zerosCount.hasOwnProperty(z)) {
        const count = zerosCount[z];
        const index = probable ? max - count : count;
        const trad = this.msg[z];
        if (explanations[index]) {
          explanations[index] += ", " + trad;
        } else {
          explanations[index] =
            trad.charAt(0).toUpperCase() + trad.slice(1);
        }
      }
    }
    const explanationsWithoutHoles = [];
    for (let i = 0; i < explanations.length; i++) {
      if (explanations[i]) {
        explanationsWithoutHoles.push(explanations[i]);
      }
    }
    return explanationsWithoutHoles;
  }
}

class Field {
  constructor(type, label) {
    this.type = type;
    this.label = label;
  }
}
class MatrixFormController {
  constructor($log, $scope, matrixService) {
    this.$log = $log;
    this.$scope = $scope;
    this.matrixService = matrixService;

    this.resultsType = "NonProbable";
    this.questionIndex = 0;

    $scope.$on("dataError", (event, msg) => {
      $log.error(msg);
      window.alert(msg);
    });

    $scope.$on("dataLoaded", (event, questions) => {
      this.questions = questions;
      this.questionsKeys = Object.keys(questions);
      this.questionChanged();
    });
  }

  load() {
    const matrixInput = document.getElementById("matrixFile").files[0] || this.matrixURL;
    const labelsInput = document.getElementById("labelsFile").files[0] || this.labelsURL;
    if (matrixInput && labelsInput) {
      this.questions = [];
      this.matrixService.load(matrixInput, labelsInput);
    }
  }

  parameterChanged() {
    this.questionIndex = this.currentQuestion.index;
    this.questionChanged();
  }

  questionChanged() {
    this.currentQuestion = this.questions[this.questionsKeys[this.questionIndex]];

    this.fields = {};
    const choices = this.currentQuestion.choices;
    const keys = Object.keys(choices);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      this.fields[key] = new Field(
        choices[key].answerType,
        choices[key].label
      );
    }
  }

  onPrevious() {
    if (this.questionIndex >= 0) {
      this.questionIndex--;
      this.questionChanged();
    }
  }

  onNext() {
    if (this.questionIndex < this.questionsKeys.length) {
      this.questionIndex++;
      this.questionChanged();
    }
  }

  compute(key) {
    const changedChoice = this.currentQuestion.choices[key];
    if (changedChoice && changedChoice.answerType === "radio") {
      for (const c in this.currentQuestion.choices) {
        if (this.currentQuestion.choices.hasOwnProperty(c)) {
          const choice = this.currentQuestion.choices[c];
          if (choice.answerType === "radio") {
            choice.value = c === key ? key : false;
          }
        }
      }
    }
    this.explanations = this.matrixService.compute(this.resultsType === "NonProbable");
  }
}
angular.module("rr0-matrix", [])
  .service("matrixService", MatrixService)
  .controller("MatrixFormController", MatrixFormController);
