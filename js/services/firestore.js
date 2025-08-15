// js/services/firestore.js
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy, writeBatch, serverTimestamp, documentId } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { db } from '../../firebase-config.js';
import { setState, getState } from '../state.js';
import { showToast } from '../ui/utils.js';

export async function fetchInitialData(user) {
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) return false;
        
        const userData = { id: userDocSnap.id, ...userDocSnap.data() };
        setState({ userData });

        const companyIdList = (userData.userCompanies || []).map(c => c.id).filter(id => id);
        
        if (!companyIdList || companyIdList.length === 0) {
            if (!userData.companyId) return false; 
            const companyRef = doc(db, 'companies', userData.companyId);
            const companySnap = await getDoc(companyRef);
            if (!companySnap.exists()) return false;
            
            const companyData = { id: companySnap.id, ...companySnap.data() };
            companyData.role = (companyData.ownerId === user.uid) ? 'owner' : 'member';
            setState({ userCompanies: [companyData], currentCompany: companyData });

        } else {
            const companiesQuery = query(collection(db, 'companies'), where(documentId(), 'in', companyIdList));
            const companiesSnap = await getDocs(companiesQuery);
            const userCompanies = companiesSnap.docs.map(doc => {
                const companyData = { id: doc.id, ...doc.data() };
                
                if (companyData.members && companyData.members[user.uid]) {
                    companyData.role = companyData.members[user.uid];
                } else if (companyData.ownerId === user.uid) {
                    companyData.role = 'owner';
                } else {
                    companyData.role = 'member';
                }
                return companyData;
            });

            setState({ userCompanies });

            const lastCompanyId = userData.lastCompanyId || userCompanies[0]?.id;
            const currentCompany = userCompanies.find(c => c.id === lastCompanyId) || userCompanies[0];
            setState({ currentCompany });
        }
        
        if (getState().currentCompany) {
            await fetchAllCompanyData();
        }
        
        return true;

    } catch (error) {
        console.error("Fel vid hämtning av initial data:", error);
        return false;
    }
}

export async function fetchAllCompanyData() {
    const { currentCompany } = getState();
    if (!currentCompany) return;

    try {
        const companyId = currentCompany.id;
        const companyRef = doc(db, 'companies', companyId);
        const companySnap = await getDoc(companyRef);
        
        let memberUIDs = [];
        if (companySnap.exists() && companySnap.data().members) {
            memberUIDs = Object.keys(companySnap.data().members);
        }

        const queries = [
            getDocs(query(collection(db, 'incomes'), where('companyId', '==', companyId))),
            getDocs(query(collection(db, 'expenses'), where('companyId', '==', companyId))),
            getDocs(query(collection(db, 'recurring'), where('companyId', '==', companyId))),
            getDocs(query(collection(db, 'products'), where('companyId', '==', companyId), orderBy('name'))),
            getDocs(query(collection(db, 'categories'), where('companyId', '==', companyId), orderBy('name'))),
            getDocs(query(collection(db, 'invoices'), where('companyId', '==', companyId))),
            getDocs(query(collection(db, 'quotes'), where('companyId', '==', companyId))),
            getDocs(query(collection(db, 'contacts'), where('companyId', '==', companyId), orderBy('name'))),
            getDocs(query(collection(db, 'projects'), where('companyId', '==', companyId), orderBy('name'))),
        ];
        
        if (memberUIDs.length > 0) {
            queries.push(getDocs(query(collection(db, 'users'), where(documentId(), 'in', memberUIDs))));
        }

        const results = await Promise.all(queries);
        
        const allIncomes = results[0].docs.map(d => ({ id: d.id, ...d.data() }));
        const allExpenses = results[1].docs.map(d => ({ id: d.id, ...d.data() }));
        const recurringTransactions = results[2].docs.map(d => ({ id: d.id, ...d.data() }));
        const allProducts = results[3].docs.map(d => ({ id: d.id, ...d.data() }));
        const categories = results[4].docs.map(d => ({ id: d.id, ...d.data() }));
        const allInvoices = results[5].docs.map(d => ({ id: d.id, ...d.data() }));
        const allQuotes = results[6].docs.map(d => ({ id: d.id, ...d.data() }));
        const allContacts = results[7].docs.map(d => ({ id: d.id, ...d.data() }));
        const allProjects = results[8].docs.map(d => ({ id: d.id, ...d.data() }));
        const teamMembers = results.length > 9 ? results[9].docs.map(d => ({ id: d.id, ...d.data() })) : [];
        
        const allTransactions = [
            ...allIncomes.map(t => ({ ...t, type: 'income' })),
            ...allExpenses.map(t => ({ ...t, type: 'expense' }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        setState({ allIncomes, allExpenses, recurringTransactions, allProducts, categories, allInvoices, allQuotes, allContacts, allProjects, teamMembers, allTransactions });
    } catch (error) {
        console.error("Kunde inte ladda all företagsdata:", error);
        showToast("Kunde inte ladda all företagsdata.", "error");
    }
}

export async function saveDocument(collectionName, data, docId = null) {
    const { currentUser, currentCompany } = getState();
    const dataToSave = { ...data, companyId: currentCompany.id };

    if (docId) {
        dataToSave.updatedAt = serverTimestamp();
        await updateDoc(doc(db, collectionName, docId), dataToSave);
    } else {
        dataToSave.createdAt = serverTimestamp();
        dataToSave.userId = currentUser.uid;
        await addDoc(collection(db, collectionName), dataToSave);
    }
}

export async function deleteDocument(collectionName, docId) {
    await deleteDoc(doc(db, collectionName, docId));
}

export async function performCorrection(type, originalId, originalData, newData) {
    const { currentUser, currentCompany } = getState();
    const collectionName = type === 'income' ? 'incomes' : 'expenses';
    
    const reversalPost = { 
        ...originalData, 
        amount: -originalData.amount, 
        isCorrection: true, 
        correctedPostId: originalId, 
        description: `Rättelse av: ${originalData.description}`, 
        createdAt: serverTimestamp(),
        userId: currentUser.uid,
        companyId: currentCompany.id,
    };

    const newPost = { 
        ...newData, 
        isCorrection: false, 
        correctsPostId: originalId,
        createdAt: serverTimestamp(),
        userId: currentUser.uid,
        companyId: currentCompany.id,
    };

    const batch = writeBatch(db);
    const originalDocRef = doc(db, collectionName, originalId);
    const reversalDocRef = doc(collection(db, collectionName));
    const newDocRef = doc(collection(db, collectionName));

    batch.update(originalDocRef, { isCorrection: true });
    batch.set(reversalDocRef, reversalPost);
    batch.set(newDocRef, newPost);

    await batch.commit();
}