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

  constructor($log, $q, $http) {
    this.$log = $log;
    this.$q = $q;
    this.$http = $http;
  }

  loadURL(u) {
    return this.$q((resolve, reject) => {
      this.$http.get(u)
        .then(response => {
          this.$log.info(`Loaded '${u}'`);
          resolve(response.data);
        })
        .catch((response, status) => {
          reject(`Could not load '${u}': ${status}`);
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

  loadFunc(input) {
    const fn = typeof input === 'object' ? this.loadFile : this.loadURL;
    return fn.bind(this)(input);
  }

  loadLabels(labelsInput) {
    return this.loadFunc(labelsInput);
  }

  loadMatrixData(matrixData, labelsInput) {
    return this.$q((resolve, reject) => {
      this.loadLabels(labelsInput)
        .then(messages => {
            this.msg = messages;
            let i = 0;
            const questions = (this.questions = {});
            for (const d in matrixData) {
              if (matrixData.hasOwnProperty(d)) {
                const item = matrixData[d];
                const dotPos = item.question.indexOf('.');
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
            resolve(questions);
          },
          (reason) => reject(reason)
        );
    });
  }

  load(matrixInput, labelsInput) {
    return this.$q((resolve, reject) => this.loadFunc(matrixInput)
      .then(matrixData => this.loadMatrixData(matrixData, labelsInput))
      .then(questions => resolve(questions))
      .catch(reason => reject(reason)));
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
          explanations[index] += `, ${trad}`;
        } else {
          explanations[index] = trad.charAt(0).toUpperCase() + trad.slice(1);
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

  constructor($log, matrixService) {
    this.$log = $log;
    this.matrixService = matrixService;

    this.resultsType = 'NonProbable';
    this.questionIndex = 0;
  }

  load() {
    const matrixInput = document.getElementById('matrixFile').files[0] || this.matrixURL;
    const labelsInput = document.getElementById('labelsFile').files[0] || this.labelsURL;
    if (matrixInput && labelsInput) {
      this.questions = [];
      this.matrixService.load(matrixInput, labelsInput)
        .then(questions => {
          this.questions = questions;
          this.questionsKeys = Object.keys(questions);
          this.questionChanged();
        })
        .catch(reason => {
          this.$log.error(reason);
          window.alert(reason);
        });
    }
  }

  parameterChanged() {
    this.questionIndex = this.currentQuestion.index;
    this.questionChanged();
  }

  setFieldsFor(choices) {
    this.fields = {};
    const keys = Object.keys(choices);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      this.fields[key] = new Field(choices[key].answerType, choices[key].label);
    }
  }

  questionChanged() {
    this.currentQuestion = this.questions[this.questionsKeys[this.questionIndex]];
    this.setFieldsFor(this.currentQuestion.choices);
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
    if (changedChoice && changedChoice.answerType === 'radio') {
      for (const c in this.currentQuestion.choices) {
        if (this.currentQuestion.choices.hasOwnProperty(c)) {
          const choice = this.currentQuestion.choices[c];
          if (choice.answerType === 'radio') {
            choice.value = c === key ? key : false;
          }
        }
      }
    }
    this.explanations = this.matrixService.compute(this.resultsType === 'NonProbable');
  }
}
const MatrixFormComponent = {
  template: `<div ng-cloak class="matrix">
  <details>
    <summary>Personnalisation</summary>
    <form name="customization">
      <fieldset class="tabs">
        <legend>Fichier matrice</legend>
        <p>Il s'agit d'une liste de question + type de réponse (choix, choix multiple...) + des valeurs de matrice pour
          ce choix.
        </p>
        <div class="tab">
          <label>Exemple</label>
          <a href=" https://raw.githubusercontent.com/RR0/rr0.org/master/time/1/9/7/7/Poher_Matrice/matrix.json" target="_blank">matrix.json</a>
        </div>
        <div class="tab">
          <label for="matrixURL">URL</label>
          <input name="matrixURL" type="text" id="matrixURL" data-ng-model="ctrl.matrixURL" data-ng-init="ctrl.matrixURL='https://raw.githubusercontent.com/RR0/rr0.org/master/time/1/9/7/7/Poher_Matrice/matrix.json'">
        </div>
        ou
        <div class="tab">
          <label for="matrixFile">Upload</label>
          <input name="matrixFile" type="file" id="matrixFile" data-ng-model="ctrl.matrixFile">
        </div>
      </fieldset>
      <fieldset class="tabs">
        <legend>Fichier libellés</legend>
        <p>Il s'agit des libellés à afficher pour chaque clé de question du fichier de matrice.</p>
        <div class="tab">
          <label>Exemples</label> <span>
              <a href="Matrix_fr.json" target="_blank">français</a>,
              <a href="Matrix_en.json" target="_blank">anglais</a>,
              <a href="Matrix_it.json" target="_blank">italien</a>
            </span>
        </div>
        <div class="tab">
          <label for="labelsURL">URL</label>
          <input name="labelsURL" type="text" id="labelsURL" data-ng-model="ctrl.labelsURL" data-ng-init="ctrl.labelsURL='https://raw.githubusercontent.com/RR0/rr0.org/master/time/1/9/7/7/Poher_Matrice/Matrix_fr.json'">
        </div>
        ou
        <div class="tab">
          <label for="labelsFile">Upload</label>
          <input name="labelsFile" type="file" id="labelsFile" data-ng-model="ctrl.labelsFile">
        </div>
      </fieldset>
      <button data-ng-click="ctrl.load()">Charger personnalisation</button>
    </form>
  </details>
  <form name="questionnaire" data-ng-init="ctrl.load()">
    <fieldset>
      <legend>Question</legend>
      <div style="margin-bottom:1em">
        <input name="previousButton" type="button" value="<" data-ng-click="ctrl.onPrevious()" data-ng-disabled="ctrl.questionIndex<=0" title="Question précédente">
        <select id="combo" data-ng-model="ctrl.currentQuestion" data-ng-options="q as q.title for (title,q) in ctrl.questions" data-ng-change="ctrl.parameterChanged()" title="Question posée"></select>
        <input name="nextButton" type="button" value=">" data-ng-click="ctrl.onNext()" data-ng-disabled="ctrl.questionIndex>=ctrl.questionsKeys.length - 1" title="Question suivante">
      </div>
    </fieldset>
    <fieldset>
      <legend>Réponse</legend>
      <div data-ng-repeat="(key, field) in ctrl.fields">
        <input type="{{ field.type }}" id="{{ key }}" name="{{ field.type == 'radio' ? 'rad' : 'chk' }}" value="{{ key }}" data-ng-model="ctrl.currentQuestion.choices[key].value" data-ng-change="ctrl.compute('{{ key }}')">
        <label for="{{ key }}">{{ field.label }}</label>
      </div>
    </fieldset>
  </form>
  <fieldset id="explanations" data-ng-show="ctrl.explanations">
    <legend>Explications</legend>
    <input type="radio" id="Probable" data-ng-model="ctrl.resultsType" value="Probable" name="resultsType" data-ng-change="ctrl.compute()"><label for="Probable">possibles</label>
    <input type="radio" id="NonProbable" data-ng-model="ctrl.resultsType" value="NonProbable" name="resultsType" data-ng-change="ctrl.compute()"><label for="NonProbable" checked="checked">improbables</label>
    <ol style="margin:0">
      <li ng-repeat="(k, p) in ctrl.explanations">{{ p }}</li>
    </ol>
  </fieldset>
</div>`,
  controllerAs: 'ctrl',
  controller: MatrixFormController
}

angular.module('matrixDemo', [])
  .service('matrixService', MatrixService)
  .component('rr0Matrix', MatrixFormComponent);
